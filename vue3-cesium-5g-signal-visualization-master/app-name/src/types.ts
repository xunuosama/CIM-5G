
// 传播模型类型
export type PropagationModelType = 'free-space' | 'cost-231-hata' | 'itu-indoor' | 'average-wall-loss-model'

// 传播模型配置接口
export interface PropagationModel {
    type: PropagationModelType
    name: string
    description: string
    parameters?: {
        // COST-231-Hata 模型参数
        cityType?: number        // 1=大城市, 0=中小城市
        terrainType?: number     // 1=城市, 0=郊区

        // ITU 室内模型参数
        floors?: number          // 楼层数
        wallLoss?: number        // 墙体损耗

        // Ray-Tracing 模型参数
        maxReflections?: number  // 最大反射次数
        minSignalLevel?: number  // 最小信号电平

        // AWM 平均墙损模型参数
        shadowFading?: number    // 阴影衰落 (dB)
        enableDetection?: boolean // 是否启用自动检测

        // 允许其他扩展参数
        [key: string]: number | boolean | undefined
    }
}


// 天线接口定义
export interface Antenna {
    id: string
    type: '单天线' | '多天线'  // 天线类型
    azimuth: number          // 方向角（度）
    elevation: number        // 俯仰角（度）
    height: number          // 天线高度（米）
    power: number           // 发射功率（dBm）
    gain: number            // 天线增益（dBi）
    frequency: number       // 工作频率（MHz）- 新增
    propagationModel: PropagationModel  // 传播模型配置 - 新增
    visualization: AntennaVisualizationConfig // 几何可视化配置
    threeJSRayTracing: ThreeJSRayTracingConfig // Three.js风格射线追踪配置
    rayTracingType: RayTracingType // 射线追踪类型
}

// 基站接口定义
export interface BaseStation {
    id: string              // 唯一标识符
    name: string           // 基站名称
    longitude: number      // 经度
    latitude: number       // 纬度
    height: number         // 基站高度（米，海拔高度）
    antennas: Antenna[]    // 关联的天线数组
}
// 信号强度计算结果
export interface SignalStrengthResult {
    rssi: number           // 接收信号强度 (dBm)
    distance: number       // 距离 (米)
    pathLoss: number       // 路径损耗 (dB)
    antennaId: string      // 天线ID
    stationId: string      // 基站ID
    model: string          // 使用的传播模型
    awmDetails?: {         // AWM模型详细信息（可选）
        penetrationResult: any
        breakdown: {
            freeSpaceLoss: number
            wallLoss: number
            shadowFading: number
            total: number
        }
    }
}
// 天线可视化配置ort interface AntennaVisualizationConfig {

export interface AntennaVisualizationConfig {
    enabled: boolean              // 是否启用可视化
    horizontalBeamWidth: number   // 水平波束宽度（度）默认120
    verticalBeamWidth: number     // 垂直波束宽度（度）默认30（±15）
    horizontalSteps: number       // 水平分割步数，默认12（每10度一个扇形）
    verticalSteps: number         // 垂直分割步数，默认30（每1度一层）
    maxDistance: number           // 最大显示距离（米）默认5000
    transparency: number          // 透明度 0-1，默认0.6
    showContours: boolean         // 是否显示等值线
}



// ========== 新增：Three.js风格射线追踪配置 ==========
export interface ThreeJSRayTracingConfig {
    enabled: boolean
    azimuthAngle: number        // 水平波束角度
    elevationAngle: number      // 垂直波束角度
    density: number             // 射线密度 1-5
    maxRange: number            // 最大距离（米）
    showObstacles: boolean      // 显示建筑物遮挡
    showRays: boolean           // 显示射线轨迹
    animateSignals: boolean     // 信号点脉动动画
    rayOpacity: number          // 射线透明度
    signalPointSize: number     // 信号点大小
}

// 射线追踪类型枚举
export type RayTracingType = 'geometric' | 'threejs'





// ========== 新增：楼体来源和3D Tiles相关类型 ==========
// 3D Tiles相关类型 - 新增
export interface TilesetInfo {
    filePath: string        // tileset.json文件路径
    boundingVolume: {       // 边界体积
        center: [number, number, number]  // 中心点 [经度, 纬度, 高度]
        dimensions: [number, number, number] // 尺寸 [宽, 长, 高]
    }
    geometricError: number  // 几何误差
    refine: string         // 细化方式
}

// 楼体来源类型 - 新增
export type BuildingSourceType = 'manual' | 'imported'

// 楼体接口定义
export interface Building {
    id: string              // 唯一标识符
    name: string           // 楼体名称
    longitude: number      // 经度（楼体中心点）
    latitude: number       // 纬度（楼体中心点）
    height: number         // 楼体高度（米）
    width: number          // 楼体宽度（米，东西方向）
    length: number         // 楼体长度（米，南北方向）
    floors: number         // 楼层数
    wallLoss: number       // 墙体损耗（dB）
    roofLoss: number       // 屋顶损耗（dB）
    floorLoss: number      // 楼层损耗（dB，每层）
    materialType: BuildingMaterialType  // 建筑材料类型
    rotation: number       // 旋转角度（度，0为正北）
    color: string          // 楼体颜色（十六进制）
    opacity: number        // 透明度 0-1
    // 新增属性
    sourceType: BuildingSourceType    // 楼体来源：手动创建 or 导入
    tilesetInfo?: TilesetInfo        // 3D Tiles信息（仅导入楼体有此字段）
    originalPath?: string            // 原始文件路径（仅导入楼体）
}

// 建筑材料类型
export type BuildingMaterialType = 'concrete' | 'brick' | 'steel' | 'glass' | 'wood'

// 建筑材料配置
export interface BuildingMaterial {
    type: BuildingMaterialType
    name: string
    wallLoss: number       // 默认墙体损耗
    roofLoss: number       // 默认屋顶损耗
    floorLoss: number      // 默认楼层损耗
    color: string          // 默认颜色
}

// 3D Tiles导入结果
export interface TilesImportResult {
    success: boolean
    importedCount: number
    failedCount: number
    buildings: Building[]
    errors: string[]
}




declare global {
    interface Window {
        showDirectoryPicker(options?: { mode?: ReadWrite; id?: string }): Promise<FileSystemDirectoryHandle>;
    }
}

type ReadWrite = 'read' | 'readwrite';
