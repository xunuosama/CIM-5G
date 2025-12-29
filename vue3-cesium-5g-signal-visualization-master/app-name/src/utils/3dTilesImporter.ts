import type { Building, TilesImportResult, TilesetInfo } from '../types'
import { nanoid } from 'nanoid'
import { getBuildingMaterial } from './buildingMaterials'
import * as Cesium from "cesium";

/**
 * 修复的3D Tiles导入器
 */
export class TilesImporter {
    private static readonly STORAGE_KEY = 'imported_3d_tiles'
    private static blobUrls = new Map<string, string>() // 存储blob URL

    /**
     * 导入3D Tiles文件夹
     */
    static async importTilesFolders(): Promise<TilesImportResult> {
        const result: TilesImportResult = {
            success: false,
            importedCount: 0,
            failedCount: 0,
            buildings: [],
            errors: []
        }

        try {
            // 选择文件
            const files = await this.selectTilesFiles()
            if (!files || files.length === 0) {
                return result
            }

            console.log(`准备导入 ${files.length} 个文件`)

            // 按文件夹分组
            const folderGroups = this.groupFilesByFolder(files)
            console.log(`发现 ${folderGroups.size} 个文件夹`)

            // 处理每个文件夹
            for (const [folderPath, folderFiles] of folderGroups) {
                try {
                    const building = await this.processTilesetFolder(folderPath, folderFiles)
                    if (building) {
                        result.buildings.push(building)
                        result.importedCount++
                        console.log(`成功导入文件夹 ${folderPath}`)
                    }
                } catch (error) {
                    result.failedCount++
                    result.errors.push(`文件夹 ${folderPath} 导入失败: ${error.message}`)
                    console.error(`文件夹 ${folderPath} 导入失败:`, error)
                }
            }

            result.success = result.importedCount > 0
            console.log(`导入完成: 成功 ${result.importedCount}, 失败 ${result.failedCount}`)

            return result

        } catch (error) {
            result.errors.push(`导入过程出错: ${error.message}`)
            console.error('3D Tiles导入失败:', error)
            return result
        }
    }

    /**
     * 选择3D Tiles文件
     */
    private static async selectTilesFiles(): Promise<FileList | null> {
        return new Promise((resolve) => {
            const input = document.createElement('input')
            input.type = 'file'
            input.webkitdirectory = true
            input.multiple = true
            input.accept = '.json,.b3dm,.pnts,.i3dm,.cmpt'

            input.onchange = (event) => {
                const files = (event.target as HTMLInputElement).files
                resolve(files)
            }

            input.oncancel = () => resolve(null)
            input.click()
        })
    }

    /**
     * 按文件夹分组文件
     */
    private static groupFilesByFolder(files: FileList): Map<string, File[]> {
        const folderMap = new Map<string, File[]>()

        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            const folderPath = this.getFolderPath(file.webkitRelativePath)

            if (!folderMap.has(folderPath)) {
                folderMap.set(folderPath, [])
            }
            folderMap.get(folderPath)!.push(file)
        }

        return folderMap
    }

    /**
     * 处理单个tileset文件夹
     */
    private static async processTilesetFolder(folderPath: string, files: File[]): Promise<Building | null> {
        console.log(`处理文件夹: ${folderPath}, 文件数: ${files.length}`)

        // 查找tileset.json文件
        const tilesetFile = files.find(f => f.name.toLowerCase() === 'tileset.json')
        if (!tilesetFile) {
            throw new Error(`文件夹 ${folderPath} 中未找到 tileset.json`)
        }

        console.log(`找到tileset.json: ${tilesetFile.name}`)

        // 解析tileset.json
        const tilesetContent = await this.readFileAsText(tilesetFile)
        const tileset = JSON.parse(tilesetContent)

        console.log('Tileset内容:', tileset)

        // 创建Blob URLs for all files
        const fileUrls = new Map<string, string>()
        for (const file of files) {
            const blobUrl = URL.createObjectURL(file)
            fileUrls.set(file.name, blobUrl)
            this.blobUrls.set(`${folderPath}/${file.name}`, blobUrl)
        }

        // 提取楼体信息
        const tilesetInfo = this.extractTilesetInfo(tileset, folderPath, fileUrls)
        const building = this.createBuildingFromTileset(tilesetInfo, folderPath)

        // 保存到localStorage用于持久化
        this.saveToLocalStorage(folderPath, files, tileset)

        return building
    }

    /**
     * 提取tileset信息
     */


    //extractTilesetInfo函数为正确版本

    private static extractTilesetInfo(
        tileset: any,
        folderPath: string,
        fileUrls: Map<string, string>
    ): TilesetInfo {
        console.log('🔍 开始解析tileset.json结构...')

        const root = tileset.root
        if (!root) {
            throw new Error('无效的tileset格式: 缺少root节点')
        }

        let center: [number, number, number] = [106.6148619, 29.5391032, 50] // 默认重庆坐标
        let dimensions: [number, number, number] = [20, 20, 30] // 默认尺寸

        // 🎯 优先处理transform矩阵（最重要！）
        if (root.transform && Array.isArray(root.transform) && root.transform.length === 16) {
            console.log('🌍 检测到Transform矩阵 - 这是真实坐标！')

            // Transform矩阵的第13、14、15个元素是ECEF坐标
            const ecefX = root.transform[12]
            const ecefY = root.transform[13]
            const ecefZ = root.transform[14]

            console.log(`ECEF坐标: X=${ecefX}, Y=${ecefY}, Z=${ecefZ}`)

            try {
                // 将ECEF坐标转换为经纬度
                const cartesian = new Cesium.Cartesian3(ecefX, ecefY, ecefZ)
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian)

                center = [
                    Cesium.Math.toDegrees(cartographic.longitude),
                    Cesium.Math.toDegrees(cartographic.latitude),
                    cartographic.height
                ]

                console.log('✅ Transform矩阵转换结果:')
                console.log(`经度: ${center[0]}°`)
                console.log(`纬度: ${center[1]}°`)
                console.log(`高度: ${center[2]}m`)

            } catch (error) {
                console.error('Transform矩阵转换失败:', error)
                // 继续使用boundingVolume方法
            }
        }

        // 🔧 处理boundingVolume获取尺寸信息
        if (root.boundingVolume) {
            console.log('📦 解析BoundingVolume获取尺寸信息')

            if (root.boundingVolume.box) {
                const box = root.boundingVolume.box
                console.log('Box数据:', box)

                // Box格式: [centerX, centerY, centerZ, halfX, 0, 0, 0, halfY, 0, 0, 0, halfZ]
                // 我们只需要尺寸信息，不需要坐标（已从transform获取）
                dimensions = [
                    Math.abs(box[3] * 2),  // 宽度 = halfX * 2
                    Math.abs(box[7] * 2),  // 长度 = halfY * 2
                    Math.abs(box[11] * 2)  // 高度 = halfZ * 2
                ]

                console.log(`从BoundingVolume获取的尺寸: ${dimensions[0]}m × ${dimensions[1]}m × ${dimensions[2]}m`)

            } else if (root.boundingVolume.region) {
                const region = root.boundingVolume.region
                console.log('Region数据:', region)

                // 如果没有transform矩阵，才使用region的坐标
                if (!root.transform) {
                    const west = region[0] * 180 / Math.PI
                    const south = region[1] * 180 / Math.PI
                    const east = region[2] * 180 / Math.PI
                    const north = region[3] * 180 / Math.PI
                    const minHeight = region[4] || 0
                    const maxHeight = region[5] || 50

                    center = [
                        (west + east) / 2,
                        (south + north) / 2,
                        (minHeight + maxHeight) / 2
                    ]
                }

                // 计算尺寸
                const latMetersPerDegree = 110540
                const lonMetersPerDegree = 111320 * Math.cos(center[1] * Math.PI / 180)

                dimensions = [
                    Math.abs(region[2] - region[0]) * lonMetersPerDegree,
                    Math.abs(region[3] - region[1]) * latMetersPerDegree,
                    Math.abs(region[5] - region[4])
                ]

            } else if (root.boundingVolume.sphere) {
                const sphere = root.boundingVolume.sphere
                console.log('Sphere数据:', sphere)

                // 如果没有transform矩阵，才使用sphere的坐标
                if (!root.transform) {
                    try {
                        const cartesian = new Cesium.Cartesian3(sphere[0], sphere[1], sphere[2])
                        const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
                        center = [
                            Cesium.Math.toDegrees(cartographic.longitude),
                            Cesium.Math.toDegrees(cartographic.latitude),
                            cartographic.height
                        ]
                    } catch (error) {
                        console.log('Sphere坐标转换失败，使用简化方法')
                    }
                }

                const radius = sphere[3]
                dimensions = [radius * 2, radius * 2, radius * 2]
            }
        }

        // 🔍 最终结果验证
        console.log('🎯 最终解析结果:')
        console.log(`中心坐标: 经度${center[0].toFixed(6)}°, 纬度${center[1].toFixed(6)}°, 高度${center[2].toFixed(2)}m`)
        console.log(`楼体尺寸: 宽${dimensions[0].toFixed(2)}m, 长${dimensions[1].toFixed(2)}m, 高${dimensions[2].toFixed(2)}m`)

        // ✅ 坐标合理性检查
        if (center[0] >= -180 && center[0] <= 180 && center[1] >= -90 && center[1] <= 90) {
            console.log('✅ 坐标范围正常')
        } else {
            console.log('⚠️ 警告: 坐标超出正常范围')
        }

        // 尺寸合理性检查和调整
        dimensions = dimensions.map(d => {
            if (d < 1) return 5      // 最小5米
            if (d > 1000) return 50  // 最大50米（对于单个楼体）
            return d
        }) as [number, number, number]

        console.log(`调整后尺寸: 宽${dimensions[0].toFixed(2)}m, 长${dimensions[1].toFixed(2)}m, 高${dimensions[2].toFixed(2)}m`)

        // 获取tileset.json的blob URL
        const tilesetUrl = fileUrls.get('tileset.json')
        if (!tilesetUrl) {
            throw new Error('无法创建tileset.json的blob URL')
        }

        return {
            filePath: tilesetUrl,
            boundingVolume: { center, dimensions },
            geometricError: root.geometricError || 100,
            refine: root.refine || 'REPLACE'
        }
    }
    /**
     * 从tileset信息创建Building对象
     */
    private static createBuildingFromTileset(tilesetInfo: TilesetInfo, folderPath: string): Building {
        const defaultMaterial = getBuildingMaterial('concrete')!
        const folderName = folderPath.split('/').pop() || 'Imported Building'

        const [centerLon, centerLat, centerHeight] = tilesetInfo.boundingVolume.center
        const [width, length, height] = tilesetInfo.boundingVolume.dimensions

        // 确保数值合理
        const safeWidth = Math.max(Math.min(width, 500), 5)
        const safeLength = Math.max(Math.min(length, 500), 5)
        const safeHeight = Math.max(Math.min(height, 300), 10)

        return {
            id: nanoid(),
            name: folderName,
            longitude: centerLon,
            latitude: centerLat,
            height: safeHeight,
            width: safeWidth,
            length: safeLength,
            floors: Math.max(Math.floor(safeHeight / 3), 1),
            wallLoss: defaultMaterial.wallLoss,
            roofLoss: defaultMaterial.roofLoss,
            floorLoss: defaultMaterial.floorLoss,
            materialType: 'concrete',
            rotation: 0,
            color: defaultMaterial.color,
            opacity: 0.8,
            sourceType: 'imported',
            tilesetInfo,
            originalPath: folderPath
        }
    }

    /**
     * 保存到localStorage
     */
    private static saveToLocalStorage(folderPath: string, files: File[], tileset: any): void {
        const savedData = {
            folderPath,
            tileset,
            fileNames: Array.from(files).map(f => f.name),
            timestamp: Date.now()
        }

        const existingData = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]')
        existingData.push(savedData)
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existingData))

        console.log(`已保存tileset数据到localStorage: ${folderPath}`)
    }

    /**
     * 获取Blob URL
     */
    static getBlobUrl(path: string): string | undefined {
        return this.blobUrls.get(path)
    }

    /**
     * 清理Blob URLs
     */
    static cleanup(): void {
        for (const url of this.blobUrls.values()) {
            URL.revokeObjectURL(url)
        }
        this.blobUrls.clear()
    }

    /**
     * 工具方法：读取文件为文本
     */
    private static readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(reader.error)
            reader.readAsText(file)
        })
    }

    /**
     * 工具方法：提取文件夹路径
     */
    private static getFolderPath(webkitRelativePath: string): string {
        const parts = webkitRelativePath.split('/')
        return parts.slice(0, -1).join('/')
    }
}