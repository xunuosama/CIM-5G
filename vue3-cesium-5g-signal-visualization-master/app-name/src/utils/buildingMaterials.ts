import type {Building, BuildingMaterial, BuildingMaterialType} from '../types'

// 预定义的建筑材料配置
export const BUILDING_MATERIALS: BuildingMaterial[] = [
    {
        type: 'concrete',
        name: '混凝土',
        wallLoss: 15,      // 混凝土墙体损耗较高
        roofLoss: 20,      // 屋顶损耗
        floorLoss: 5,      // 每层楼板损耗
        color: '#8B8B8B'   // 灰色
    },
    {
        type: 'brick',
        name: '砖体结构',
        wallLoss: 12,      // 砖体损耗中等
        roofLoss: 18,
        floorLoss: 4,
        color: '#CD853F'   // 棕色
    },
    {
        type: 'steel',
        name: '钢结构',
        wallLoss: 25,      // 钢结构反射较强，损耗很高
        roofLoss: 30,
        floorLoss: 8,
        color: '#708090'   // 钢蓝色
    },
    {
        type: 'glass',
        name: '玻璃幕墙',
        wallLoss: 8,       // 玻璃损耗较低
        roofLoss: 12,
        floorLoss: 3,
        color: '#87CEEB'   // 天蓝色（半透明效果）
    },
    {
        type: 'wood',
        name: '木结构',
        wallLoss: 6,       // 木结构损耗最低
        roofLoss: 10,
        floorLoss: 2,
        color: '#DEB887'   // 木色
    }
]

/**
 * 获取建筑材料配置
 */
export function getBuildingMaterial(type: BuildingMaterialType): BuildingMaterial | null {
    return BUILDING_MATERIALS.find(material => material.type === type) || null
}

/**
 * 获取所有建筑材料
 */
export function getAllBuildingMaterials(): BuildingMaterial[] {
    return [...BUILDING_MATERIALS]
}

/**
 * 计算楼体对信号的总损耗
 * @param building 楼体信息
 * @param penetrationPoints 穿透点数（穿过几面墙/几层楼）
 * @returns 总损耗值（dB）
 */
export function calculateBuildingLoss(
    building: Building,
    penetrationPoints: { walls: number; floors: number }
): number {
    const wallLoss = building.wallLoss * penetrationPoints.walls
    const floorLoss = building.floorLoss * penetrationPoints.floors

    return wallLoss + floorLoss
}