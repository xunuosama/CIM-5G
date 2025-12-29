import { defineStore } from 'pinia'
import type { Building, BuildingMaterialType } from '../types'
import { getBuildingMaterial } from '../utils/buildingMaterials'
import { TilesImporter } from '../utils/3dTilesImporter'
import type { TilesImportResult } from '../types'

export const useBuildingStore = defineStore('buildings', {
    state: () => ({
        buildings: [] as Building[],           // 所有楼体数据
        selectedBuildingId: null as string | null,  // 当前选中的楼体ID
        isCreatingBuilding: false,            // 是否处于创建楼体模式
        isImporting: false,              // 是否正在导入
        importProgress: 0,               // 导入进度
        lastImportResult: null as TilesImportResult | null,  // 最后一次导入结果
    }),

    actions: {
        // 切换创建楼体模式
        toggleBuildingCreationMode() {
            this.isCreatingBuilding = !this.isCreatingBuilding
        },

        // 设置创建楼体模式
        setBuildingCreationMode(mode: boolean) {
            this.isCreatingBuilding = mode
        },


        // 选中指定楼体
        selectBuilding(id: string) {
            this.selectedBuildingId = id
        },

        // 取消选择楼体
        unselectBuilding() {
            this.selectedBuildingId = null
        },

        // 更新楼体信息
        updateBuilding(id: string, data: Partial<Building>) {
            const index = this.buildings.findIndex(b => b.id === id)
            if (index !== -1) {
                this.buildings[index] = { ...this.buildings[index], ...data }

                // 触发地图更新事件
                window.dispatchEvent(new CustomEvent('updateBuildingOnMap', {
                    detail: {
                        buildingId: id,
                        building: this.buildings[index]
                    }
                }))
            }
        },

        // 删除楼体
        removeBuilding(id: string) {
            const index = this.buildings.findIndex(b => b.id === id)
            if (index !== -1) {
                const buildingToRemove = this.buildings[index]
                this.buildings.splice(index, 1)

                // 如果删除的是当前选中的楼体，清除选中状态
                if (this.selectedBuildingId === id) {
                    this.selectedBuildingId = null
                }

                // 触发自定义事件，通知地图更新
                window.dispatchEvent(new CustomEvent('removeBuildingFromMap', {
                    detail: { buildingId: id, building: buildingToRemove }
                }))
            }
        },

        // 清空所有楼体
        clearAllBuildings() {
            this.buildings = []
            this.selectedBuildingId = null
            this.isCreatingBuilding = false
            window.dispatchEvent(new CustomEvent('clearAllBuildingsFromMap'))
        },

        // 更新楼体材料（会自动更新相关损耗参数）
        updateBuildingMaterial(id: string, materialType: BuildingMaterialType) {
            const building = this.buildings.find(b => b.id === id)
            const material = getBuildingMaterial(materialType)

            if (building && material) {
                this.updateBuilding(id, {
                    materialType: materialType,
                    wallLoss: material.wallLoss,
                    roofLoss: material.roofLoss,
                    floorLoss: material.floorLoss,
                    color: material.color
                })
            }
        },



        // 导入3D Tiles楼体
        async importTilesBuildings(): Promise<TilesImportResult> {
            this.isImporting = true
            this.importProgress = 0

            try {
                console.log('开始导入3D Tiles楼体...')

                const result = await TilesImporter.importTilesFolders()
                this.lastImportResult = result

                if (result.success && result.buildings.length > 0) {
                    // 添加导入的楼体到store
                    result.buildings.forEach(building => {
                        this.buildings.push(building)
                    })

                    console.log(`成功导入 ${result.importedCount} 个楼体`)

                    // 触发地图更新事件
                    window.dispatchEvent(new CustomEvent('reloadBuildingsOnMap', {
                        detail: { buildings: this.buildings }
                    }))
                }

                return result

            } catch (error) {
                console.error('导入3D Tiles楼体失败:', error)
                const errorResult: TilesImportResult = {
                    success: false,
                    importedCount: 0,
                    failedCount: 1,
                    buildings: [],
                    errors: [error.message]
                }
                this.lastImportResult = errorResult
                return errorResult

            } finally {
                this.isImporting = false
                this.importProgress = 100
            }
        },

        // 清除导入状态
        clearImportStatus() {
            this.isImporting = false
            this.importProgress = 0
            this.lastImportResult = null
        },

        addBuilding(building: Building) {
            // 确保手动创建的楼体有正确的sourceType
            if (!building.sourceType) {
                building.sourceType = 'manual'
            }

            console.log('🏗️ Adding building to store:', building.name, 'sourceType:', building.sourceType)
            this.buildings.push(building)
            console.log('📊 Store状态 - 总楼体:', this.buildings.length, '手动楼体:', this.buildings.filter(b => b.sourceType === 'manual').length)
        },
    },

    getters: {
        // 获取当前选中的楼体
        selectedBuilding(state): Building | null {
            return state.buildings.find(b => b.id === state.selectedBuildingId) || null
        },

        // 获取楼体总数
        totalBuildings(state): number {
            return state.buildings.length
        },

        // 获取楼体总体积（立方米）
        totalBuildingVolume(state): number {
            return state.buildings.reduce((total, building) => {
                return total + (building.width * building.length * building.height)
            }, 0)
        },

        // 按材料类型分组的楼体统计
        buildingsByMaterial(state): Record<BuildingMaterialType, number> {
            const stats: Record<string, number> = {}

            state.buildings.forEach(building => {
                const material = building.materialType
                stats[material] = (stats[material] || 0) + 1
            })

            return stats as Record<BuildingMaterialType, number>
        },

        // 平均墙体损耗
        averageWallLoss(state): number {
            if (state.buildings.length === 0) return 0

            const totalLoss = state.buildings.reduce((sum, building) => sum + building.wallLoss, 0)
            return Math.round((totalLoss / state.buildings.length) * 100) / 100
        },

        // 手动创建的楼体
        manualBuildings(state): Building[] {
            return state.buildings.filter(b => b.sourceType === 'manual')
        },

        // 导入的楼体
        importedBuildings(state): Building[] {
            return state.buildings.filter(b => b.sourceType === 'imported')
        },

        // 手动创建楼体数量
        manualBuildingsCount(state): number {
            return state.buildings.filter(b => b.sourceType === 'manual').length
        },

        // 导入楼体数量
        importedBuildingsCount(state): number {
            return state.buildings.filter(b => b.sourceType === 'imported').length
        },
    }
})