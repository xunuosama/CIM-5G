import * as Cesium from 'cesium'
import type { BaseStation, Antenna } from '../types'
import workerpool from 'workerpool'
import {traceRayWorker} from '../utils/threejsRayTraceWorker'
import { calculateSignalStrength } from '../utils/propagationModels'

// 3D射线追踪配置
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

// 3D射线追踪结果点
export interface RayTracingPoint {
    position: Cesium.Cartesian3
    strength: number            // 信号强度 dBm
    color: Cesium.Color
    blocked: boolean            // 是否被遮挡
    distance: number            // 距离
}

// 射线轨迹
export interface RayTrajectory {
    points: Cesium.Cartesian3[]
    blocked: boolean
    signalPoints: RayTracingPoint[]
}

/**
 * Three.js风格的3D射线追踪计算核心
 */
export class ThreeJSRayTracingCore {
    private config: ThreeJSRayTracingConfig
    private viewer: Cesium.Viewer
    private pool;//进程池
    constructor(viewer: Cesium.Viewer, config: ThreeJSRayTracingConfig) {
        this.viewer = viewer
        this.config = config
        this.pool = workerpool.pool(new URL('./traceRayWorker.ts', import.meta.url).href, {
            maxWorkers: navigator.hardwareConcurrency
        });
    }

    updateConfig(newConfig: Partial<ThreeJSRayTracingConfig>): void {
        this.config = { ...this.config, ...newConfig }
    }

    /**
     * 计算3D射线追踪 - 核心算法
     */
    /**
    这个使用webworker进行并行计算，
    const tasks = [];
    for (let az = -this.config.azimuthAngle / 2; az <= this.config.azimuthAngle / 2; az += azStep) {
      for (let el = -this.config.elevationAngle / 2; el <= this.config.elevationAngle / 2; el += elStep) {
        tasks.push(
          this.pool.exec('traceRay', [antennaPos, antenna, az, el, distStep, this.config])
        );
      }
    }

    const results = await Promise.all(tasks);
    // 过滤空轨迹并打印进度
    const trajectories = results.filter(r => r.points.length > 0);
    console.log(`总共完成 ${trajectories.length} 条射线`);
    return trajectories;
    */
    calculateRayTracing(station: BaseStation, antenna: Antenna): RayTrajectory[] {
        if (!this.config.enabled) return []

        const trajectories: RayTrajectory[] = []
        const antennaPos = this.getAntennaPosition(station, antenna)

        // 计算射线密度步长
        const azimuthStep = this.config.azimuthAngle / (this.config.density * 8)
        const elevationStep = this.config.elevationAngle / (this.config.density * 4)
        const distanceStep = this.config.maxRange / (this.config.density * 15)

        console.log(`开始3D射线追踪计算: ${Math.ceil(this.config.azimuthAngle / azimuthStep)} x ${Math.ceil(this.config.elevationAngle / elevationStep)} 条射线`)
        // 生成3D扇形射线网格
        for (let az = -this.config.azimuthAngle / 2; az <= this.config.azimuthAngle / 2; az += azimuthStep) {
            for (let el = -this.config.elevationAngle / 2; el <= this.config.elevationAngle / 2; el += elevationStep) {
                const trajectory = this.traceRay(antennaPos, antenna, az, el, distanceStep)
                if (trajectory.points.length > 0) {
                    trajectories.push(trajectory)
                }
            }
        }
        console.log(`总共完成 ${trajectories.length} 条射线`);

        return trajectories
    }

    /**
     * 单条射线追踪 - 真正的3D算法
     */
    private traceRay(
        antennaPos: Cesium.Cartesian3,
        antenna: Antenna,
        azimuth: number,
        elevation: number,
        distanceStep: number
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
        for (let dist = distanceStep; dist <= this.config.maxRange && !blocked; dist += distanceStep) {
            const rayPoint = Cesium.Cartesian3.add(
                antennaPos,
                Cesium.Cartesian3.multiplyByScalar(direction, dist, new Cesium.Cartesian3()),
                new Cesium.Cartesian3()
            )

            rayPoints.push(rayPoint)

            // 检查射线是否被地形或建筑物遮挡
            if (this.config.showObstacles) {
                blocked = this.checkRayOcclusion(antennaPos, rayPoint)
            }
            blocked = false // 这里暂时禁用遮挡检测，实际应用中可以启用
            if (!blocked) {
                // 计算该点的信号强度（基于Three.js算法）
                const signalStrength = this.calculateSignalStrength(dist, azimuth, elevation, antenna)

                // 只有信号强度足够的点才添加
                if (signalStrength > -120) {
                    const signalPoint: RayTracingPoint = {
                        position: rayPoint,
                        strength: signalStrength,
                        color: this.getSignalColor(signalStrength),
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

    /**
     * 射线遮挡检测 - 使用Cesium的射线投射
     */
    private checkRayOcclusion(startPos: Cesium.Cartesian3, endPos: Cesium.Cartesian3): boolean {
        try {
            // 创建射线
            const direction = Cesium.Cartesian3.subtract(endPos, startPos, new Cesium.Cartesian3())
            const distance = Cesium.Cartesian3.magnitude(direction)
            Cesium.Cartesian3.normalize(direction, direction)

            const ray = new Cesium.Ray(startPos, direction)

            // 检查与地形的相交
            const terrainIntersection = this.viewer.scene.globe.pick(ray, this.viewer.scene)
            if (terrainIntersection) {
                const terrainDistance = Cesium.Cartesian3.distance(startPos, terrainIntersection)
                if (terrainDistance < distance * 0.95) {
                    return true // 被地形遮挡
                }
            }

            // 检查与3D模型（建筑物）的相交
            const modelIntersections = this.viewer.scene.drillPick(ray.origin, 5)
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

    /**
     * 信号强度计算 - 基于Three.js的算法
     */
    private calculateSignalStrength(
        distance: number,
        azimuth: number,
        elevation: number,
        antenna: Antenna
    ): number {
        // 基础自由空间路径损耗
        const frequency = antenna.frequency || 1800 // MHz
        const pathLoss = 32.45 + 20 * Math.log10(distance / 1000) + 20 * Math.log10(frequency)

        // 天线方向图衰减（Three.js风格）
        const azimuthAttenuation = Math.abs(azimuth) / (this.config.azimuthAngle / 2) * 10
        const elevationAttenuation = Math.abs(elevation) / (this.config.elevationAngle / 2) * 5

        // 计算RSSI
        const txPower = antenna.power || 20 // dBm
        const antennaGain = antenna.gain || 15 // dBi
        const rssi = txPower + antennaGain - pathLoss - azimuthAttenuation - elevationAttenuation

        return Math.round(rssi * 100) / 100
    }

    /**
     * 信号强度颜色映射 - 与Three.js样例保持一致
     */
    private getSignalColor(rssi: number): Cesium.Color {
        if (rssi > -60) return Cesium.Color.LIME           // 绿色 - 强信号
        if (rssi > -70) return Cesium.Color.GREENYELLOW    // 黄绿色 - 良好信号
        if (rssi > -80) return Cesium.Color.YELLOW         // 黄色 - 中等信号
        if (rssi > -100) return Cesium.Color.ORANGE        // 橙色 - 弱信号
        return Cesium.Color.RED                            // 红色 - 很弱信号
    }

    /**
     * 获取天线在世界坐标系中的位置
     */
    private getAntennaPosition(station: BaseStation, antenna: Antenna): Cesium.Cartesian3 {
        const antennaHeight = station.height + antenna.height
        return Cesium.Cartesian3.fromDegrees(
            station.longitude,
            station.latitude,
            antennaHeight
        )
    }
}

/**
 * 3D射线追踪可视化渲染器 - 模拟Three.js效果
 */
export class ThreeJSRayTracingRenderer {
    private viewer: Cesium.Viewer
    private config: ThreeJSRayTracingConfig
    private entities: Cesium.Entity[] = []
    private animationTime: number = 0
    private animationId: number | null = null

    constructor(viewer: Cesium.Viewer, config: ThreeJSRayTracingConfig) {
        this.viewer = viewer
        this.config = config
    }

    updateConfig(newConfig: Partial<ThreeJSRayTracingConfig>): void {
        this.config = { ...this.config, ...newConfig }
    }

    /**
     * 渲染3D射线追踪结果
     */
    async  renderRayTracing(trajectories: RayTrajectory[], antennaId: string): Promise<void> {
        this.clearAntenna(antennaId)

        trajectories.forEach((trajectory, index) => {
            // 渲染射线轨迹
            if (this.config.showRays && trajectory.points.length > 1) {
                this.renderRayTrajectory(trajectory, antennaId, index)
            }

            // 渲染信号点
            trajectory.signalPoints.forEach((point, pointIndex) => {
                this.renderSignalPoint(point, antennaId, index, pointIndex)
            })
        })

        // 启动动画
        if (this.config.animateSignals) {
            this.startAnimation()
        }
    }

    /**
     * 渲染射线轨迹
     */
    private renderRayTrajectory(trajectory: RayTrajectory, antennaId: string, index: number): void {
        const color = trajectory.blocked ?
            Cesium.Color.GRAY.withAlpha(this.config.rayOpacity * 0.3) :
            Cesium.Color.CYAN.withAlpha(this.config.rayOpacity)

        const entity = this.viewer.entities.add({
            id: `threejs-ray-${antennaId}-trajectory-${index}`,
            polyline: {
                positions: trajectory.points,
                width: trajectory.blocked ? 1 : 2,
                material: color,
                clampToGround: false
            }
        })

        this.entities.push(entity)
    }

    /**
     * 渲染信号点 - Three.js风格的球形点
     */
    private renderSignalPoint(
        point: RayTracingPoint,
        antennaId: string,
        trajectoryIndex: number,
        pointIndex: number
    ): void {
        const size = point.blocked ?
            this.config.signalPointSize * 0.5 :
            this.config.signalPointSize

        const entity = this.viewer.entities.add({
            id: `threejs-ray-${antennaId}-point-${trajectoryIndex}-${pointIndex}`,
            position: point.position,
            point: {
                pixelSize: size,
                color: point.color,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: point.blocked ? 0 : 1,
                heightReference: Cesium.HeightReference.NONE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                scaleByDistance: new Cesium.NearFarScalar(100, 2.0, 1000, 0.5)
            }
        })

        this.entities.push(entity)
    }

    /**
     * 启动Three.js风格的脉动动画
     */
    private startAnimation(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId)
        }

        const animate = () => {
            this.animationTime += 0.02

            // 为所有信号点添加脉动效果
            this.entities.forEach((entity, index) => {
                if (entity.point && entity.id && entity.id.toString().includes('point')) {
                    const pulse = 1 + Math.sin(this.animationTime * 3 + index * 0.1) * 0.3
                    const originalSize = this.config.signalPointSize
                    if (entity.point.pixelSize) {
                        entity.point.pixelSize = new Cesium.ConstantProperty(originalSize * pulse)
                    }
                }
            })

            if (this.config.animateSignals) {
                this.animationId = requestAnimationFrame(animate)
            }
        }

        animate()
    }

    /**
     * 停止动画
     */
    private stopAnimation(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId)
            this.animationId = null
        }
    }

    /**
     * 清除指定天线的渲染
     */
    clearAntenna(antennaId: string): void {
        const toRemove = this.entities.filter(entity =>
            entity.id && entity.id.toString().includes(`threejs-ray-${antennaId}`)
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
     * 清除所有渲染
     */
    clearAll(): void {
        this.stopAnimation()
        this.entities.forEach(entity => {
            this.viewer.entities.remove(entity)
        })
        this.entities = []
    }
}

/**
 * Three.js风格的3D射线追踪管理器
 */
export class ThreeJSRayTracingManager {
    private viewer: Cesium.Viewer
    private core: ThreeJSRayTracingCore
    private renderer: ThreeJSRayTracingRenderer
    private config: ThreeJSRayTracingConfig

    constructor(viewer: Cesium.Viewer, config?: Partial<ThreeJSRayTracingConfig>) {
        this.viewer = viewer

        // 默认配置 - 与Three.js样例保持一致
        const defaultConfig: ThreeJSRayTracingConfig = {
            enabled: false,
            azimuthAngle: 120,          // 水平120度
            elevationAngle: 30,         // 垂直30度
            density: 3,                 // 中等密度
            maxRange: 500,              // 500米
            showObstacles: true,        // 显示遮挡
            showRays: true,             // 显示射线
            animateSignals: true,       // 信号脉动
            rayOpacity: 0.4,            // 射线透明度
            signalPointSize: 4          // 信号点大小
        }

        this.config = { ...defaultConfig, ...config }
        this.core = new ThreeJSRayTracingCore(viewer, this.config)
        this.renderer = new ThreeJSRayTracingRenderer(viewer, this.config)
    }

    /**
     * 启用Three.js风格射线追踪
     */
    enable(config?: Partial<ThreeJSRayTracingConfig>): void {
        this.config.enabled = true
        if (config) {
            this.updateConfig(config)
        }
        console.log('Three.js风格3D射线追踪已启用')
    }

    /**
     * 禁用射线追踪
     */
    disable(): void {
        this.config.enabled = false
        this.renderer.clearAll()
        console.log('Three.js风格3D射线追踪已禁用')
    }

    /**
     * 更新配置
     */
    updateConfig(config: Partial<ThreeJSRayTracingConfig>): void {
        this.config = { ...this.config, ...config }
        this.core.updateConfig(this.config)
        this.renderer.updateConfig(this.config)
    }

    /**
     * 渲染天线的3D射线追踪
     */
    async renderAntenna(station: BaseStation, antenna: Antenna): Promise<void> {
        this.config.enabled = antenna.threeJSRayTracing.enabled;
        if (!this.config.enabled) return

        console.log('开始Three.js风格3D射线追踪计算...')

        try {
            // 使用Three.js算法计算射线追踪
            const trajectories = this.core.calculateRayTracing(station, antenna)
            console.log('计算完毕')
            // 渲染结果
            this.renderer.renderRayTracing(trajectories, antenna.id)

            console.log(`Three.js风格3D射线追踪完成: ${(trajectories).length} 条射线`)
        } catch (error) {
            console.error('Three.js风格3D射线追踪失败:', error)
        }
    }

    /**
     * 清除指定天线
     */
    clearAntenna(antennaId: string): void {
        this.renderer.clearAntenna(antennaId)
    }

    /**
     * 清除所有
     */
    clearAll(): void {
        this.renderer.clearAll()
    }

    /**
     * 获取当前配置
     */
    getConfig(): ThreeJSRayTracingConfig {
        return { ...this.config }
    }

    /**
     * 获取状态
     */
    isEnabled(): boolean {
        return this.config.enabled
    }
}