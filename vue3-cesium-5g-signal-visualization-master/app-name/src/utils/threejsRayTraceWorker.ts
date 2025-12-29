
import * as Cesium from "cesium";
import type {Antenna, ThreeJSRayTracingConfig} from "../types.ts";
import type {RayTracingPoint, RayTrajectory} from "./threejsRayTracing.ts";



export function traceRayWorker(
    antennaPos :  Cesium.Cartesian3,      // Cesium.Cartesian3
    antenna :Antenna,         // Antenna 配置
    azimuth :number,         // 天线方位角偏移
    elevation:number,       // 天线俯仰角偏移
    distanceStep:number,    // 距离步长
    config: ThreeJSRayTracingConfig,
    view:  Cesium.Viewer,
): RayTrajectory {
    // 计算3D方向向量（球面坐标转笛卡尔坐标）
    const azRad = Cesium.Math.toRadians(azimuth + antenna.azimuth)
    const elRad = Cesium.Math.toRadians(elevation + antenna.elevation)

    // 3D射线方向（考虑天线指向）
    const direction = new Cesium.Cartesian3(
        Math.sin(azRad) * Math.cos(elRad),
        Math.sin(elRad),
        Math.cos(azRad) * Math.cos(elRad)
    )

    const rayPoints: Cesium.Cartesian3[] = []
    const signalPoints: RayTracingPoint[] = []
    let blocked = false

    // 沿射线方向逐步采样
    for (let dist = distanceStep; dist <= config.maxRange && !blocked; dist += distanceStep) {
        const rayPoint = Cesium.Cartesian3.add(
            antennaPos,
            Cesium.Cartesian3.multiplyByScalar(direction, dist, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
        )

        rayPoints.push(rayPoint)

        // 检查射线是否被地形或建筑物遮挡
        if (config.showObstacles) {
            blocked = checkRayOcclusion(antennaPos, rayPoint,view)
        }

        if (!blocked) {
            // 计算该点的信号强度（基于Three.js算法）
            const signalStrength = calculateSignalStrength(dist, azimuth, elevation, antenna,  config)

            // 只有信号强度足够的点才添加
            if (signalStrength > -120) {
                const signalPoint: RayTracingPoint = {
                    position: rayPoint,
                    strength: signalStrength,
                    color: getSignalColor(signalStrength),
                    blocked: false,
                    distance: dist
                }
                signalPoints.push(signalPoint)
            }
        } else {
            // 添加遮挡区域的点（灰色）
            const blockedPoint: RayTracingPoint = {
                position: rayPoint,
                strength: -150,
                color: Cesium.Color.GRAY.withAlpha(0.3),
                blocked: true,
                distance: dist
            }
            signalPoints.push(blockedPoint)
        }
    }

    return {
        points: rayPoints,
        blocked,
        signalPoints
    }
}
function checkRayOcclusion(startPos: Cesium.Cartesian3, endPos: Cesium.Cartesian3,  viewer: Cesium.Viewer): boolean {
    try {
        // 创建射线
        const direction = Cesium.Cartesian3.subtract(endPos, startPos, new Cesium.Cartesian3())
        const distance = Cesium.Cartesian3.magnitude(direction)
        Cesium.Cartesian3.normalize(direction, direction)

        const ray = new Cesium.Ray(startPos, direction)

        // 检查与地形的相交
        const terrainIntersection = viewer.scene.globe.pick(ray, viewer.scene)
        if (terrainIntersection) {
            const terrainDistance = Cesium.Cartesian3.distance(startPos, terrainIntersection)
            if (terrainDistance < distance * 0.95) {
                return true // 被地形遮挡
            }
        }

        // 检查与3D模型（建筑物）的相交
        const modelIntersections = viewer.scene.drillPick(ray.origin, 5)
        if (modelIntersections && modelIntersections.length > 0) {
            for (const intersection of modelIntersections) {
                const intersectionDistance = Cesium.Cartesian3.distance(startPos, intersection.position)
                if (intersectionDistance < distance * 0.95) {
                    return true // 被建筑物遮挡
                }
            }
        }

        return false
    } catch (error) {
        console.warn('射线遮挡检测失败:', error)
        return false
    }
}
function calculateSignalStrength(
    distance: number,
    azimuth: number,
    elevation: number,
    antenna: Antenna,
    config: ThreeJSRayTracingConfig
): number {
    // 基础自由空间路径损耗
    const frequency = antenna.frequency || 1800 // MHz
    const pathLoss = 32.45 + 20 * Math.log10(distance / 1000) + 20 * Math.log10(frequency)

    // 天线方向图衰减（Three.js风格）
    const azimuthAttenuation = Math.abs(azimuth) / (config.azimuthAngle / 2) * 10
    const elevationAttenuation = Math.abs(elevation) / (config.elevationAngle / 2) * 5

    // 计算RSSI
    const txPower = antenna.power || 20 // dBm
    const antennaGain = antenna.gain || 15 // dBi
    const rssi = txPower + antennaGain - pathLoss - azimuthAttenuation - elevationAttenuation

    return Math.round(rssi * 100) / 100
}
function getSignalColor(rssi: number): Cesium.Color {
    if (rssi > -60) return Cesium.Color.LIME           // 绿色 - 强信号
    if (rssi > -70) return Cesium.Color.GREENYELLOW    // 黄绿色 - 良好信号
    if (rssi > -80) return Cesium.Color.YELLOW         // 黄色 - 中等信号
    if (rssi > -100) return Cesium.Color.ORANGE        // 橙色 - 弱信号
    return Cesium.Color.RED                            // 红色 - 很弱信号
}