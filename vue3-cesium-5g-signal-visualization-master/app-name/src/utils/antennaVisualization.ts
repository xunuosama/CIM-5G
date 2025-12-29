import * as Cesium from 'cesium'
import type { BaseStation, Antenna,  AntennaVisualizationConfig } from '../types'
import { calculateSignalStrength } from './propagationModels'

/**
 * 度转弧度
 */
function toRadians(degrees: number): number {
    return degrees * Math.PI / 180
}

/**
 * 弧度转度
 */
function toDegrees(radians: number): number {
    return radians * 180 / Math.PI
}

/**
 * 根据信号强度获取颜色
 */
function getSignalStrengthColor(rssi: number, alpha: number = 0.6): Cesium.Color {
    let color: Cesium.Color

    if (rssi > -60) color = Cesium.Color.GREEN        // 极强信号
    else if (rssi > -70) color = Cesium.Color.LIME    // 强信号
    else if (rssi > -80) color = Cesium.Color.YELLOW  // 中等信号
    else if (rssi > -90) color = Cesium.Color.ORANGE  // 弱信号
    else if (rssi > -100) color = Cesium.Color.RED    // 很弱信号
    else color = Cesium.Color.GRAY                    // 极弱/无信号

    return color.withAlpha(alpha)
}

/**
 * 计算球面坐标系中的点
 * @param centerLon 中心经度
 * @param centerLat 中心纬度
 * @param centerHeight 中心高度
 * @param distance 距离（米）
 * @param azimuth 方位角（度，0为正北）
 * @param elevation 俯仰角（度，0为水平）
 */
function calculateSphericalPoint(
    centerLon: number,
    centerLat: number,
    centerHeight: number,
    distance: number,
    azimuth: number,
    elevation: number
): Cesium.Cartesian3 {
    // 地球半径
    const earthRadius = 6371000

    // 转换为弧度
    const azimuthRad = toRadians(azimuth)
    const elevationRad = toRadians(elevation)
    const centerLatRad = toRadians(centerLat)
    const centerLonRad = toRadians(centerLon)

    // 计算水平距离
    const horizontalDistance = distance * Math.cos(elevationRad)

    // 计算垂直偏移
    const verticalOffset = distance * Math.sin(elevationRad)

    // 计算目标纬度
    const targetLatRad = Math.asin(
        Math.sin(centerLatRad) * Math.cos(horizontalDistance / earthRadius) +
        Math.cos(centerLatRad) * Math.sin(horizontalDistance / earthRadius) * Math.cos(azimuthRad)
    )

    // 计算目标经度
    const targetLonRad = centerLonRad + Math.atan2(
        Math.sin(azimuthRad) * Math.sin(horizontalDistance / earthRadius) * Math.cos(centerLatRad),
        Math.cos(horizontalDistance / earthRadius) - Math.sin(centerLatRad) * Math.sin(targetLatRad)
    )

    const targetHeight = centerHeight + verticalOffset

    return Cesium.Cartesian3.fromDegrees(
        toDegrees(targetLonRad),
        toDegrees(targetLatRad),
        targetHeight
    )
}



/**
 * 为天线创建3D射线可视化
 */
export class AntennaRayVisualization {
    private viewer: Cesium.Viewer
    private entities: Cesium.Entity[] = []

    constructor(viewer: Cesium.Viewer) {
        this.viewer = viewer
    }

    /**
     * 清除所有天线射线可视化
     */
    clearAll(): void {
        this.entities.forEach(entity => {
            this.viewer.entities.remove(entity)
        })
        this.entities = []
    }

    /**
     * 清除指定天线的射线可视化
     */
    clearAntenna(antennaId: string): void {
        const toRemove = this.entities.filter(entity =>
            entity.id && entity.id.toString().includes(antennaId)
        )

        toRemove.forEach(entity => {
            this.viewer.entities.remove(entity)
            const index = this.entities.indexOf(entity)
            if (index > -1) {
                this.entities.splice(index, 1)
            }
        })
    }

    /**
     * 渲染天线的3D射线效果
     */
    renderAntenna(station: BaseStation, antenna: Antenna): void {
        const config = antenna.visualization
        if (!config.enabled) return

        // 清除该天线之前的可视化
        this.clearAntenna(antenna.id)

        // 计算天线实际位置
        const antennaHeight = station.height + antenna.height

        // 计算水平和垂直的角度范围
        const horizontalStart = antenna.azimuth - config.horizontalBeamWidth / 2
        const horizontalEnd = antenna.azimuth + config.horizontalBeamWidth / 2
        const verticalStart = antenna.elevation - config.verticalBeamWidth / 2
        const verticalEnd = antenna.elevation + config.verticalBeamWidth / 2
        console.log(antenna.elevation)
        // 水平角度步长
        const horizontalStep = config.horizontalBeamWidth / config.horizontalSteps
        // 垂直角度步长
        const verticalStep = config.verticalBeamWidth / config.verticalSteps

        // 距离分层（同心圆）
        const distanceSteps = 10 // 5个距离层
        const maxDistance = config.maxDistance

        // 生成每个小扇形区域
        for (let h = 0; h < config.horizontalSteps; h++) {
            const azStart = horizontalStart + h * horizontalStep
            const azEnd = horizontalStart + (h + 1) * horizontalStep

            for (let v = 0; v < config.verticalSteps; v++) {
                const elStart = verticalStart + v * verticalStep
                const elEnd = verticalStart + (v + 1) * verticalStep

                for (let d = 0; d < distanceSteps; d++) {
                    const innerRadius = (d / distanceSteps) * maxDistance
                    const outerRadius = ((d + 1) / distanceSteps) * maxDistance

                    // 计算该区域中心点的信号强度
                    const centerAz = (azStart + azEnd) / 2
                    const centerEl = (elStart + elEnd) / 2
                    const centerDistance = (innerRadius + outerRadius) / 2

                    // 计算目标点坐标
                    const targetPoint = calculateSphericalPoint(
                        station.longitude,
                        station.latitude,
                        antennaHeight,
                        centerDistance,
                        centerAz,
                        centerEl
                    )

                    const targetCarto = Cesium.Cartographic.fromCartesian(targetPoint)
                    const targetLon = toDegrees(targetCarto.longitude)
                    const targetLat = toDegrees(targetCarto.latitude)
                    const targetHeight = targetCarto.height

                    // 计算信号强度
                    const signalResult = calculateSignalStrength(
                        station, antenna, targetLat, targetLon, targetHeight,this.viewer
                    )

                    // 创建扇形区域
                    this.createSectorEntity(
                        station, antenna, signalResult.rssi,
                        azStart, azEnd, elStart, elEnd,
                        innerRadius, outerRadius,
                        antennaHeight, h, v, d
                    )
                }
            }
        }

        // 如果启用等值线，添加等值线显示
        if (config.showContours) {
            this.addContourLines(station, antenna)
        }
    }


    /**
     * 创建单个扇形实体 - 使用Polyline
     */
    private createSectorEntity(
        station: BaseStation,
        antenna: Antenna,
        rssi: number,
        azStart: number,
        azEnd: number,
        elStart: number,
        elEnd: number,
        innerRadius: number,
        outerRadius: number,
        antennaHeight: number,
        hIndex: number,
        vIndex: number,
        dIndex: number
    ): void {
        const config = antenna.visualization
        const color = getSignalStrengthColor(rssi, config.transparency)

        // 1. 创建径向线（从内圈到外圈）
        const radialLines = 5 // 每个扇形创建5条径向线
        for (let r = 0; r < radialLines; r++) {
            const az = azStart + (azEnd - azStart) * (r / (radialLines - 1))
            const positions: Cesium.Cartesian3[] = []

            // 从内半径到外半径创建线条
            const distanceSteps = 10
            for (let d = 0; d <= distanceSteps; d++) {
                const distance = innerRadius + (outerRadius - innerRadius) * (d / distanceSteps)
                const elevation = elStart + (elEnd - elStart) * (d / distanceSteps)

                const point = calculateSphericalPoint(
                    station.longitude, station.latitude, antennaHeight,
                    distance, az, elevation
                )
                positions.push(point)
            }

            // 创建径向线实体
            const radialEntity = this.viewer.entities.add({
                id: `antenna-radial-${antenna.id}-${hIndex}-${vIndex}-${dIndex}-${r}`,
                polyline: {
                    positions: positions,
                    width: 1,
                    material: color,
                    clampToGround: false
                }
            })

            this.entities.push(radialEntity)
        }

        // 2. 创建弧形线（连接相同距离的点）
        const arcLines = 3 // 创建3条弧形线
        for (let a = 0; a < arcLines; a++) {
            const distance = innerRadius + (outerRadius - innerRadius) * (a / (arcLines - 1))
            const elevation = elStart + (elEnd - elStart) * (a / (arcLines - 1))
            const positions: Cesium.Cartesian3[] = []

            // 沿着方位角创建弧形
            const angleSteps = 10
            for (let i = 0; i <= angleSteps; i++) {
                const az = azStart + (azEnd - azStart) * (i / angleSteps)

                const point = calculateSphericalPoint(
                    station.longitude, station.latitude, antennaHeight,
                    distance, az, elevation
                )
                positions.push(point)
            }

            // 创建弧形线实体
            const arcEntity = this.viewer.entities.add({
                id: `antenna-arc-${antenna.id}-${hIndex}-${vIndex}-${dIndex}-${a}`,
                polyline: {
                    positions: positions,
                    width: 1,
                    material: color,
                    clampToGround: false
                }
            })

            this.entities.push(arcEntity)
        }
    }

    /**
     * 添加等值线显示
     */
    private addContourLines(station: BaseStation, antenna: Antenna): void {
        const config = antenna.visualization
        const antennaHeight = station.height + antenna.height

        // 创建几条主要的等值线
        const contourDistances = [1000, 2000, 3000, 4000] // 距离等值线
        const contourAngles = [
            antenna.azimuth - config.horizontalBeamWidth / 4,
            antenna.azimuth,
            antenna.azimuth + config.horizontalBeamWidth / 4
        ] // 方向等值线

        // 距离等值线（同心弧）
        contourDistances.forEach((distance, index) => {
            if (distance > config.maxDistance) return

            const positions: Cesium.Cartesian3[] = []
            const angleSteps = 20

            for (let i = 0; i <= angleSteps; i++) {
                const az = (antenna.azimuth - config.horizontalBeamWidth / 2) +
                    (config.horizontalBeamWidth * i / angleSteps)

                const point = calculateSphericalPoint(
                    station.longitude, station.latitude, antennaHeight,
                    distance, az, antenna.elevation
                )
                positions.push(point)
            }

            const entity = this.viewer.entities.add({
                id: `antenna-contour-distance-${antenna.id}-${index}`,
                polyline: {
                    positions,
                    width: 2,
                    material: Cesium.Color.WHITE.withAlpha(0.8),
                    clampToGround: false
                }
            })

            this.entities.push(entity)
        })

        // 方向等值线（射线）
        contourAngles.forEach((azimuth, index) => {
            const positions: Cesium.Cartesian3[] = []
            const distanceSteps = 10

            for (let i = 0; i <= distanceSteps; i++) {
                const distance = (config.maxDistance * i / distanceSteps)

                const point = calculateSphericalPoint(
                    station.longitude, station.latitude, antennaHeight,
                    distance, azimuth, antenna.elevation
                )
                positions.push(point)
            }

            const entity = this.viewer.entities.add({
                id: `antenna-contour-angle-${antenna.id}-${index}`,
                polyline: {
                    positions,
                    width: 2,
                    material: Cesium.Color.CYAN.withAlpha(0.6),
                    clampToGround: false
                }
            })

            this.entities.push(entity)
        })
    }
}