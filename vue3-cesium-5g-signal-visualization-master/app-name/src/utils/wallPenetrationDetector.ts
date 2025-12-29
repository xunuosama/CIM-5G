import * as Cesium from 'cesium'
import type { Building } from '../types'
import { useBuildingStore } from '../stores/buildings'
import { getBuildingMaterial } from './buildingMaterials'

// 墙体穿透检测结果
export interface WallPenetrationResult {
    wallCount: number           // 穿透的墙体数量
    averageWallLoss: number    // 平均墙体损耗 (dB/墙)
    totalWallLoss: number      // 总墙体损耗 (dB)
    penetratedBuildings: Array<{
        building: Building
        penetrationPoints: number  // 在该楼体中的穿透点数
        wallLoss: number          // 该楼体的墙体损耗
    }>
    rayPath: Cesium.Cartesian3[] // 射线路径点（用于可视化）
}

// 射线与楼体的交点信息
interface BuildingIntersection {
    building: Building
    entryPoint: Cesium.Cartesian3
    exitPoint: Cesium.Cartesian3
    penetrationDistance: number
}

/**
 * 墙体穿透检测器类
 * 专门用于检测射线穿过的墙体数量和损耗
 */
/**
 * 兼容版墙体穿透检测器
 * 不依赖Cesium包围盒API，使用自定义几何算法
 */
export class WallPenetrationDetector {
    private viewer: Cesium.Viewer | null = null
    private buildingStore = useBuildingStore()

    constructor(viewer?: Cesium.Viewer) {
        this.viewer = viewer || null
    }

    setViewer(viewer: Cesium.Viewer): void {
        this.viewer = viewer
    }

    /**
     * 检测射线穿透的墙体
     */
    detectWallPenetration(
        startLocation: { lat: number, lon: number, height: number },
        endLocation: { lat: number, lon: number, height: number }
    ): WallPenetrationResult {
        console.log('🎯 开始兼容版墙体穿透检测')
        console.log('起点:', startLocation)
        console.log('终点:', endLocation)

        // 转换为Cesium坐标
        const startPos = Cesium.Cartesian3.fromDegrees(
            startLocation.lon,
            startLocation.lat,
            startLocation.height
        )
        const endPos = Cesium.Cartesian3.fromDegrees(
            endLocation.lon,
            endLocation.lat,
            endLocation.height
        )

        // 使用兼容的检测方法
        const intersections = this.findBuildingIntersectionsCompatible(startPos, endPos)

        // 计算穿透结果
        return this.calculatePenetrationResult(intersections, startPos, endPos)
    }

    /**
     * 兼容版建筑物交点检测
     */
    private findBuildingIntersectionsCompatible(
        startPos: Cesium.Cartesian3,
        endPos: Cesium.Cartesian3
    ): BuildingIntersection[] {
        console.log('🏗️ 使用兼容版建筑物交点检测')

        const intersections: BuildingIntersection[] = []
        const buildings = this.buildingStore.buildings

        console.log('建筑物数量:', buildings.length)

        for (const building of buildings) {
            console.log(`检测建筑物: ${building.name}`)

            // 方法1: 使用rayTriangle检测（如果可能）
            let intersection = this.detectUsingTriangles(startPos, endPos, building)

            if (!intersection) {
                // 方法2: 使用自定义AABB算法
                intersection = this.detectUsingCustomAABB(startPos, endPos, building)
            }

            if (!intersection) {
                // 方法3: 使用经纬度投影检测
                intersection = this.detectUsingProjection(startPos, endPos, building)
            }

            if (intersection) {
                console.log(`✅ 建筑物 ${building.name} 检测到交点`)
                intersections.push(intersection)
            } else {
                console.log(`❌ 建筑物 ${building.name} 未检测到交点`)
            }
        }

        // 按距离排序
        intersections.sort((a, b) => {
            const distA = Cesium.Cartesian3.distance(startPos, a.entryPoint)
            const distB = Cesium.Cartesian3.distance(startPos, b.entryPoint)
            return distA - distB
        })

        console.log('总共检测到交点数:', intersections.length)
        return intersections
    }

    /**
     * 方法1: 使用rayTriangle检测（将建筑物分解为三角形）
     */
    private detectUsingTriangles(
        startPos: Cesium.Cartesian3,
        endPos: Cesium.Cartesian3,
        building: Building
    ): BuildingIntersection | null {

        console.log('  🔺 尝试三角形检测...')

        try {
            // 计算射线
            const rayDirection = Cesium.Cartesian3.subtract(endPos, startPos, new Cesium.Cartesian3())
            const rayLength = Cesium.Cartesian3.magnitude(rayDirection)
            Cesium.Cartesian3.normalize(rayDirection, rayDirection)

            // 创建建筑物的三角形面
            const triangles = this.createBuildingTriangles(building)

            let minDistance = Infinity
            let maxDistance = -Infinity
            let hasIntersection = false

            // 检测与每个三角形的交点
            for (const triangle of triangles) {
                const intersection = Cesium.IntersectionTests.rayTriangle(
                    new Cesium.Ray(startPos, rayDirection),
                    triangle.v0,
                    triangle.v1,
                    triangle.v2
                )

                if (intersection) {
                    const distance = Cesium.Cartesian3.distance(startPos, intersection)
                    if (distance <= rayLength) {
                        hasIntersection = true
                        minDistance = Math.min(minDistance, distance)
                        maxDistance = Math.max(maxDistance, distance)
                    }
                }
            }

            if (hasIntersection) {
                console.log('  ✅ 三角形检测成功')

                const entryPoint = Cesium.Cartesian3.add(
                    startPos,
                    Cesium.Cartesian3.multiplyByScalar(rayDirection, minDistance, new Cesium.Cartesian3()),
                    new Cesium.Cartesian3()
                )

                const exitPoint = Cesium.Cartesian3.add(
                    startPos,
                    Cesium.Cartesian3.multiplyByScalar(rayDirection, maxDistance, new Cesium.Cartesian3()),
                    new Cesium.Cartesian3()
                )

                return {
                    building,
                    entryPoint,
                    exitPoint,
                    penetrationDistance: maxDistance - minDistance
                }
            }

        } catch (error) {
            console.log('  ❌ 三角形检测失败:', error)
        }

        return null
    }

    /**
     * 创建建筑物的三角形面
     */
    private createBuildingTriangles(building: Building): Array<{v0: Cesium.Cartesian3, v1: Cesium.Cartesian3, v2: Cesium.Cartesian3}> {
        const triangles = []

        // 计算建筑物的8个顶点
        const centerLon = building.longitude
        const centerLat = building.latitude

        const latMetersPerDegree = 110540
        const lonMetersPerDegree = 111320 * Math.cos(centerLat * Math.PI / 180)

        const halfWidthDeg = (building.width / 2) / lonMetersPerDegree
        const halfLengthDeg = (building.length / 2) / latMetersPerDegree

        // 8个顶点坐标
        const vertices = [
            // 底面4个顶点
            Cesium.Cartesian3.fromDegrees(centerLon - halfWidthDeg, centerLat - halfLengthDeg, 0),
            Cesium.Cartesian3.fromDegrees(centerLon + halfWidthDeg, centerLat - halfLengthDeg, 0),
            Cesium.Cartesian3.fromDegrees(centerLon + halfWidthDeg, centerLat + halfLengthDeg, 0),
            Cesium.Cartesian3.fromDegrees(centerLon - halfWidthDeg, centerLat + halfLengthDeg, 0),
            // 顶面4个顶点
            Cesium.Cartesian3.fromDegrees(centerLon - halfWidthDeg, centerLat - halfLengthDeg, building.height),
            Cesium.Cartesian3.fromDegrees(centerLon + halfWidthDeg, centerLat - halfLengthDeg, building.height),
            Cesium.Cartesian3.fromDegrees(centerLon + halfWidthDeg, centerLat + halfLengthDeg, building.height),
            Cesium.Cartesian3.fromDegrees(centerLon - halfWidthDeg, centerLat + halfLengthDeg, building.height)
        ]

        // 创建12个三角形（每个面2个三角形，6个面）
        const faces = [
            // 前面
            [0, 1, 5], [0, 5, 4],
            // 右面
            [1, 2, 6], [1, 6, 5],
            // 后面
            [2, 3, 7], [2, 7, 6],
            // 左面
            [3, 0, 4], [3, 4, 7],
            // 底面
            [0, 3, 2], [0, 2, 1],
            // 顶面
            [4, 5, 6], [4, 6, 7]
        ]

        for (const face of faces) {
            triangles.push({
                v0: vertices[face[0]],
                v1: vertices[face[1]],
                v2: vertices[face[2]]
            })
        }

        return triangles
    }

    /**
     * 方法2: 自定义AABB算法
     */
    private detectUsingCustomAABB(
        startPos: Cesium.Cartesian3,
        endPos: Cesium.Cartesian3,
        building: Building
    ): BuildingIntersection | null {

        console.log('  📦 尝试自定义AABB检测...')

        try {
            // 计算射线参数
            const rayDirection = Cesium.Cartesian3.subtract(endPos, startPos, new Cesium.Cartesian3())
            const rayLength = Cesium.Cartesian3.magnitude(rayDirection)
            Cesium.Cartesian3.normalize(rayDirection, rayDirection)

            // 计算建筑物边界
            const centerLon = building.longitude
            const centerLat = building.latitude

            const latMetersPerDegree = 110540
            const lonMetersPerDegree = 111320 * Math.cos(centerLat * Math.PI / 180)

            const halfWidthDeg = (building.width / 2) / lonMetersPerDegree
            const halfLengthDeg = (building.length / 2) / latMetersPerDegree

            // 建筑物边界框
            const boxMin = Cesium.Cartesian3.fromDegrees(
                centerLon - halfWidthDeg,
                centerLat - halfLengthDeg,
                0
            )
            const boxMax = Cesium.Cartesian3.fromDegrees(
                centerLon + halfWidthDeg,
                centerLat + halfLengthDeg,
                building.height
            )

            // 自定义AABB射线交点算法
            const intersection = this.customRayAABBIntersection(
                startPos,
                rayDirection,
                boxMin,
                boxMax,
                rayLength
            )

            if (intersection) {
                console.log('  ✅ 自定义AABB检测成功')

                const entryPoint = Cesium.Cartesian3.add(
                    startPos,
                    Cesium.Cartesian3.multiplyByScalar(rayDirection, intersection.start, new Cesium.Cartesian3()),
                    new Cesium.Cartesian3()
                )

                const exitPoint = Cesium.Cartesian3.add(
                    startPos,
                    Cesium.Cartesian3.multiplyByScalar(rayDirection, intersection.stop, new Cesium.Cartesian3()),
                    new Cesium.Cartesian3()
                )

                return {
                    building,
                    entryPoint,
                    exitPoint,
                    penetrationDistance: intersection.stop - intersection.start
                }
            }

        } catch (error) {
            console.log('  ❌ 自定义AABB检测失败:', error)
        }

        return null
    }

    /**
     * 自定义AABB射线交点算法
     */
    private customRayAABBIntersection(
        rayOrigin: Cesium.Cartesian3,
        rayDirection: Cesium.Cartesian3,
        boxMin: Cesium.Cartesian3,
        boxMax: Cesium.Cartesian3,
        maxDistance: number
    ): { start: number; stop: number } | null {

        let tMin = 0
        let tMax = maxDistance

        // X轴检测
        if (Math.abs(rayDirection.x) < 1e-10) {
            if (rayOrigin.x < boxMin.x || rayOrigin.x > boxMax.x) {
                return null
            }
        } else {
            const t1 = (boxMin.x - rayOrigin.x) / rayDirection.x
            const t2 = (boxMax.x - rayOrigin.x) / rayDirection.x

            const tNear = Math.min(t1, t2)
            const tFar = Math.max(t1, t2)

            tMin = Math.max(tMin, tNear)
            tMax = Math.min(tMax, tFar)

            if (tMin > tMax) return null
        }

        // Y轴检测
        if (Math.abs(rayDirection.y) < 1e-10) {
            if (rayOrigin.y < boxMin.y || rayOrigin.y > boxMax.y) {
                return null
            }
        } else {
            const t1 = (boxMin.y - rayOrigin.y) / rayDirection.y
            const t2 = (boxMax.y - rayOrigin.y) / rayDirection.y

            const tNear = Math.min(t1, t2)
            const tFar = Math.max(t1, t2)

            tMin = Math.max(tMin, tNear)
            tMax = Math.min(tMax, tFar)

            if (tMin > tMax) return null
        }

        // Z轴检测
        if (Math.abs(rayDirection.z) < 1e-10) {
            if (rayOrigin.z < boxMin.z || rayOrigin.z > boxMax.z) {
                return null
            }
        } else {
            const t1 = (boxMin.z - rayOrigin.z) / rayDirection.z
            const t2 = (boxMax.z - rayOrigin.z) / rayDirection.z

            const tNear = Math.min(t1, t2)
            const tFar = Math.max(t1, t2)

            tMin = Math.max(tMin, tNear)
            tMax = Math.min(tMax, tFar)

            if (tMin > tMax) return null
        }

        // 检查最终结果
        if (tMin <= tMax && tMax >= 0 && tMin <= maxDistance) {
            const start = Math.max(0, tMin)
            const stop = Math.min(maxDistance, tMax)

            if (start < stop) {
                return { start, stop }
            }
        }

        return null
    }

    /**
     * 方法3: 经纬度投影检测（最简单可靠）
     */
    private detectUsingProjection(
        startPos: Cesium.Cartesian3,
        endPos: Cesium.Cartesian3,
        building: Building
    ): BuildingIntersection | null {

        console.log('  🌍 尝试经纬度投影检测...')

        try {
            // 转换射线端点为经纬度
            const startCarto = Cesium.Cartographic.fromCartesian(startPos)
            const endCarto = Cesium.Cartographic.fromCartesian(endPos)

            const startLat = Cesium.Math.toDegrees(startCarto.latitude)
            const startLon = Cesium.Math.toDegrees(startCarto.longitude)
            const endLat = Cesium.Math.toDegrees(endCarto.latitude)
            const endLon = Cesium.Math.toDegrees(endCarto.longitude)

            // 计算建筑物边界
            const latMetersPerDegree = 110540
            const lonMetersPerDegree = 111320 * Math.cos(building.latitude * Math.PI / 180)

            const buildingLatSpan = building.length / latMetersPerDegree
            const buildingLonSpan = building.width / lonMetersPerDegree

            const buildingMinLat = building.latitude - buildingLatSpan / 2
            const buildingMaxLat = building.latitude + buildingLatSpan / 2
            const buildingMinLon = building.longitude - buildingLonSpan / 2
            const buildingMaxLon = building.longitude + buildingLonSpan / 2

            // 射线边界框
            const rayMinLat = Math.min(startLat, endLat)
            const rayMaxLat = Math.max(startLat, endLat)
            const rayMinLon = Math.min(startLon, endLon)
            const rayMaxLon = Math.max(startLon, endLon)

            // 检查水平投影是否相交
            const latIntersect = (rayMaxLat >= buildingMinLat) && (rayMinLat <= buildingMaxLat)
            const lonIntersect = (rayMaxLon >= buildingMinLon) && (rayMinLon <= buildingMaxLon)

            // 检查高度范围
            const rayMinHeight = Math.min(startCarto.height, endCarto.height)
            const rayMaxHeight = Math.max(startCarto.height, endCarto.height)
            const heightIntersect = (rayMaxHeight >= 0) && (rayMinHeight <= building.height)

            console.log(`    纬度相交: ${latIntersect}`)
            console.log(`    经度相交: ${lonIntersect}`)
            console.log(`    高度相交: ${heightIntersect}`)

            if (latIntersect && lonIntersect && heightIntersect) {
                console.log('  ✅ 经纬度投影检测成功')

                // 简化的穿透距离计算
                const distance = Cesium.Cartesian3.distance(startPos, endPos)
                const penetrationDistance = Math.min(distance / 3, Math.min(building.width, building.length))

                // 计算大概的进入和退出点
                const progress1 = 0.3 // 30%处进入
                const progress2 = 0.7 // 70%处退出

                const entryPoint = Cesium.Cartesian3.lerp(startPos, endPos, progress1, new Cesium.Cartesian3())
                const exitPoint = Cesium.Cartesian3.lerp(startPos, endPos, progress2, new Cesium.Cartesian3())

                return {
                    building,
                    entryPoint,
                    exitPoint,
                    penetrationDistance
                }
            }

        } catch (error) {
            console.log('  ❌ 经纬度投影检测失败:', error)
        }

        return null
    }

    /**
     * 计算穿透结果（保持原有逻辑）
     */
    private calculatePenetrationResult(
        intersections: BuildingIntersection[],
        startPos: Cesium.Cartesian3,
        endPos: Cesium.Cartesian3
    ): WallPenetrationResult {
        console.log('📊 计算穿透结果...')

        const penetratedBuildings: WallPenetrationResult['penetratedBuildings'] = []
        let totalWallCount = 0
        let totalWallLoss = 0
        const rayPath: Cesium.Cartesian3[] = [startPos]

        for (const intersection of intersections) {
            const building = intersection.building
            const material = getBuildingMaterial(building.materialType)

            if (!material) continue

            const penetrationPoints = this.estimateWallPenetrationCount(
                intersection.penetrationDistance,
                building
            )

            const buildingWallLoss = material.wallLoss
            const buildingTotalLoss = buildingWallLoss * penetrationPoints

            penetratedBuildings.push({
                building,
                penetrationPoints,
                wallLoss: buildingWallLoss
            })

            totalWallCount += penetrationPoints
            totalWallLoss += buildingTotalLoss

            rayPath.push(intersection.entryPoint, intersection.exitPoint)

            console.log(`  建筑物: ${building.name}`)
            console.log(`    穿透距离: ${intersection.penetrationDistance.toFixed(2)}米`)
            console.log(`    墙体数: ${penetrationPoints}`)
            console.log(`    墙体损耗: ${buildingTotalLoss.toFixed(2)}dB`)
        }

        rayPath.push(endPos)

        const averageWallLoss = totalWallCount > 0 ? totalWallLoss / totalWallCount : 0

        const result = {
            wallCount: totalWallCount,
            averageWallLoss,
            totalWallLoss,
            penetratedBuildings,
            rayPath
        }

        console.log('🎯 最终结果:')
        console.log(`  总墙体数: ${totalWallCount}`)
        console.log(`  总墙体损耗: ${totalWallLoss.toFixed(2)}dB`)
        console.log(`  平均墙损: ${averageWallLoss.toFixed(2)}dB/墙`)

        return result
    }

    /**
     * 估算穿透的墙体数量
     */
    private estimateWallPenetrationCount(penetrationDistance: number, building: Building): number {
        const minDimension = Math.min(building.width, building.length)

        if (penetrationDistance <= minDimension) {
            return 2
        }

        const internalWallSpacing = 8
        const internalWalls = Math.floor(penetrationDistance / internalWallSpacing)

        return 2 + internalWalls
    }

    // 保留其他方法...
    visualizePenetrationPath(result: WallPenetrationResult, id: string = 'penetration-path'): void {
        if (!this.viewer || result.rayPath.length < 2) return

        const existingEntity = this.viewer.entities.getById(id)
        if (existingEntity) {
            this.viewer.entities.remove(existingEntity)
        }

        this.viewer.entities.add({
            id,
            polyline: {
                positions: result.rayPath,
                width: 3,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.3,
                    color: Cesium.Color.YELLOW
                }),
                clampToGround: false
            }
        })

        result.penetratedBuildings.forEach((item, index) => {
            const building = item.building
            const position = Cesium.Cartesian3.fromDegrees(
                building.longitude,
                building.latitude,
                building.height + 5
            )

            this.viewer!.entities.add({
                id: `${id}-penetration-${index}`,
                position,
                point: {
                    pixelSize: 10,
                    color: Cesium.Color.RED,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2
                },
                label: {
                    text: `${item.penetrationPoints}墙\n${item.wallLoss.toFixed(1)}dB`,
                    font: '10px sans-serif',
                    pixelOffset: new Cesium.Cartesian2(0, -30),
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 1,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE
                }
            })
        })
    }

    clearVisualization(id: string = 'penetration-path'): void {
        if (!this.viewer) return

        const entities = this.viewer.entities.values.filter(entity =>
            entity.id && entity.id.toString().includes(id)
        )

        entities.forEach(entity => {
            this.viewer!.entities.remove(entity)
        })
    }
}

// 全局实例（单例模式）
let globalDetector: WallPenetrationDetector | null = null

/**
 * 获取全局墙体穿透检测器实例
 */
export function getWallPenetrationDetector(viewer?: Cesium.Viewer): WallPenetrationDetector {
    if (!globalDetector) {
        globalDetector = new WallPenetrationDetector(viewer)
    } else if (viewer && !globalDetector['viewer']) {
        globalDetector.setViewer(viewer)
    }
    return globalDetector
}

/**
 * 快速检测墙体穿透（便捷函数）
 */
export function detectWallPenetration(
    startLocation: { lat: number, lon: number, height: number },
    endLocation: { lat: number, lon: number, height: number },
    viewer?: Cesium.Viewer
): WallPenetrationResult {
    const detector = getWallPenetrationDetector(viewer)
    return detector.detectWallPenetration(startLocation, endLocation)
}