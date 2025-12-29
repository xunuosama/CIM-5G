// utils/3dTilesLoader.ts
import type { Building, TilesetInfo } from '../types'
import { nanoid } from 'nanoid'
import { getBuildingMaterial } from './buildingMaterials'
import * as Cesium from 'cesium'

export interface TilesManifest {
    folders: Array<{
        name: string
        description?: string
        enabled?: boolean
    }>
    version: string
    lastUpdated: string
}

export class TilesLoader {
    private static readonly BASE_PATH = '/3dtitlebuilding'  // 绝对路径，正确拼写
    private static readonly MANIFEST_PATH = '/3dtitlebuilding/tiles-manifest.json'

    /**
     * 扫描并加载所有3D Tiles文件夹
     */
    static async loadAll3DTiles(): Promise<Building[]> {
        console.log('🚀 开始扫描和加载本地3D Tiles文件夹...')

        const buildings: Building[] = []

        try {
            // 方法1：优先尝试加载manifest文件
            const manifestBuildings = await this.loadFromManifest()
            if (manifestBuildings.length > 0) {
                buildings.push(...manifestBuildings)
                console.log(`✅ 通过manifest加载了 ${manifestBuildings.length} 个3D Tiles`)
                return buildings
            }

            // 方法2：如果没有manifest，尝试自动发现
            console.log('📋 未找到manifest文件，尝试自动发现3D Tiles文件夹...')
            const discoveredBuildings = await this.autoDiscoverTiles()
            buildings.push(...discoveredBuildings)

            console.log(`✅ 自动发现并加载了 ${discoveredBuildings.length} 个3D Tiles`)
            return buildings

        } catch (error) {
            console.error('❌ 加载3D Tiles失败:', error)
            return buildings
        }
    }

    /**
     * 从manifest文件加载3D Tiles
     */
    private static async loadFromManifest(): Promise<Building[]> {
        try {
            console.log('📋 尝试加载tiles-manifest.json...')

            const response = await fetch(this.MANIFEST_PATH)
            if (!response.ok) {
                throw new Error(`Manifest文件加载失败: ${response.status}`)
            }

            const manifest: TilesManifest = await response.json()
            console.log('📋 Manifest文件内容:', manifest)

            const buildings: Building[] = []

            for (const folderInfo of manifest.folders) {
                // 跳过禁用的文件夹
                if (folderInfo.enabled === false) {
                    console.log(`⏭️ 跳过禁用的文件夹: ${folderInfo.name}`)
                    continue
                }

                try {
                    const building = await this.loadTilesetFolder(folderInfo.name)
                    if (building) {
                        buildings.push(building)
                        console.log(`✅ 加载3D Tiles: ${folderInfo.name}`)
                    }
                } catch (error) {
                    console.error(`❌ 加载文件夹 ${folderInfo.name} 失败:`, error)
                }
            }

            return buildings

        } catch (error) {
            console.warn('📋 Manifest文件加载失败:', error)
            return []
        }
    }

    /**
     * 自动发现3D Tiles文件夹
     */
    private static async autoDiscoverTiles(): Promise<Building[]> {
        // 这里需要根据你的实际情况预定义文件夹名称
        // 因为浏览器无法直接列出目录内容
        const knownFolders = [
            'Tile_+021_+021',
            'Tile_+022_+019',
            'Tile_+022_+020',
            'Tile_+022_+021',
            'Tile_+023_+018',
            'Tile_+023_+019',


            // 添加更多已知的文件夹名称...
        ]

        const buildings: Building[] = []

        console.log(`🔍 尝试加载已知的 ${knownFolders.length} 个文件夹...`)

        for (const folderName of knownFolders) {
            try {
                const building = await this.loadTilesetFolder(folderName)
                if (building) {
                    buildings.push(building)
                    console.log(`✅ 发现并加载: ${folderName}`)
                }
            } catch (error) {
                // 静默忽略不存在的文件夹
                console.log(`⏭️ 文件夹不存在: ${folderName}`)
            }
        }

        return buildings
    }

    /**
     * 加载单个3D Tiles文件夹
     */
    private static async loadTilesetFolder(folderName: string): Promise<Building | null> {
        try {

            const tilesetUrl = `${this.BASE_PATH}/${folderName}/tileset.json`
            console.log(tilesetUrl);
            // 加载tileset.json文件
            const response = await fetch(tilesetUrl)
            if (!response.ok) {
                throw new Error(`Tileset文件加载失败: ${response.status}`)
            }

            const tileset = await response.json()
            console.log(`📄 加载tileset.json: ${folderName}`)

            // 解析tileset信息
            const tilesetInfo = this.extractTilesetInfo(tileset, folderName)

            // 创建Building对象
            const building = this.createBuildingFromTileset(tilesetInfo, folderName)

            console.log(`🏗️ 创建Building: ${building.name}`)
            return building

        } catch (error) {
            console.error(`加载文件夹 ${folderName} 失败:`, error)
            return null
        }
    }

    /**
     * 提取tileset信息（与之前的代码相同）
     */
    private static extractTilesetInfo(tileset: any, folderName: string): TilesetInfo {
        console.log('🔍 解析tileset.json结构...')

        const root = tileset.root
        if (!root) {
            throw new Error('无效的tileset格式: 缺少root节点')
        }

        let center: [number, number, number] = [106.6148619, 29.5391032, 50] // 默认重庆坐标
        let dimensions: [number, number, number] = [20, 20, 30] // 默认尺寸

        // 优先处理transform矩阵
        if (root.transform && Array.isArray(root.transform) && root.transform.length === 16) {
            console.log('🌍 检测到Transform矩阵')

            const ecefX = root.transform[12]
            const ecefY = root.transform[13]
            const ecefZ = root.transform[14]

            try {
                const cartesian = new Cesium.Cartesian3(ecefX, ecefY, ecefZ)
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian)

                center = [
                    Cesium.Math.toDegrees(cartographic.longitude),
                    Cesium.Math.toDegrees(cartographic.latitude),
                    cartographic.height
                ]

                console.log(`✅ Transform矩阵转换: 经度${center[0].toFixed(6)}°, 纬度${center[1].toFixed(6)}°`)

            } catch (error) {
                console.error('Transform矩阵转换失败:', error)
            }
        }

        // 处理boundingVolume获取尺寸
        if (root.boundingVolume) {
            if (root.boundingVolume.box) {
                const box = root.boundingVolume.box
                dimensions = [
                    Math.abs(box[3] * 2),
                    Math.abs(box[7] * 2),
                    Math.abs(box[11] * 2)
                ]
            } else if (root.boundingVolume.region) {
                const region = root.boundingVolume.region
                if (!root.transform) {
                    const west = region[0] * 180 / Math.PI
                    const south = region[1] * 180 / Math.PI
                    const east = region[2] * 180 / Math.PI
                    const north = region[3] * 180 / Math.PI
                    const minHeight = region[4] || 0
                    const maxHeight = region[5] || 50

                    center = [(west + east) / 2, (south + north) / 2, (minHeight + maxHeight) / 2]
                }

                const latMetersPerDegree = 110540
                const lonMetersPerDegree = 111320 * Math.cos(center[1] * Math.PI / 180)

                dimensions = [
                    Math.abs(region[2] - region[0]) * lonMetersPerDegree,
                    Math.abs(region[3] - region[1]) * latMetersPerDegree,
                    Math.abs(region[5] - region[4])
                ]
            }
        }

        // 尺寸合理性检查
        dimensions = dimensions.map(d => {
            if (d < 1) return 5
            if (d > 1000) return 50
            return d
        }) as [number, number, number]

        console.log(`📐 解析结果: 中心[${center[0].toFixed(6)}, ${center[1].toFixed(6)}, ${center[2].toFixed(2)}], 尺寸[${dimensions[0].toFixed(2)}, ${dimensions[1].toFixed(2)}, ${dimensions[2].toFixed(2)}]`)

        return {
            filePath: `${this.BASE_PATH}/${folderName}/tileset.json`,
            boundingVolume: { center, dimensions },
            geometricError: root.geometricError || 100,
            refine: root.refine || 'REPLACE'
        }
    }

    /**
     * 从tileset信息创建Building对象（与之前的代码相同）
     */
    private static createBuildingFromTileset(tilesetInfo: TilesetInfo, folderName: string): Building {
        const defaultMaterial = getBuildingMaterial('concrete')!

        const [centerLon, centerLat, centerHeight] = tilesetInfo.boundingVolume.center
        const [width, length, height] = tilesetInfo.boundingVolume.dimensions

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
            originalPath: folderName
        }
    }

    /**
     * 生成manifest文件的辅助方法
     */
    static generateManifestTemplate(folderNames: string[]): TilesManifest {
        return {
            version: "1.0",
            lastUpdated: new Date().toISOString(),
            folders: folderNames.map(name => ({
                name: name,
                description: `3D Tiles dataset: ${name}`,
                enabled: true
            }))
        }
    }
}