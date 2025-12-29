<template>
  <div ref="cesiumContainer" id="cesiumContainer">
    <!-- 楼体检测控制面板 -->
    <div class="detection-panel" v-if="showDetectionPanel">
      <div class="panel-header">
        <h4>🏗️ 楼体检测</h4>
        <button @click="toggleDetectionPanel" class="close-btn">✕</button>
      </div>

      <div class="panel-content">
        <div class="detection-status">
          <div class="status-item">
            <span>3D Tiles状态:</span>
            <span :class="tilesetStatus">{{ tilesetStatus }}</span>
          </div>
          <div class="status-item">
            <span>检测到楼体:</span>
            <span class="detected-count">{{ detectedBuildingsCount }}</span>
          </div>
        </div>

        <div class="detection-controls">
          <h5>🎛️ 检测参数</h5>

          <div class="control-group">
            <label>最小高度: {{ detectionConfig.minHeight }}m</label>
            <input type="range" v-model.number="detectionConfig.minHeight"
                   min="1" max="20" step="1" @input="updateDetectionConfig" />
          </div>

          <div class="control-group">
            <label>最大高度: {{ detectionConfig.maxHeight }}m</label>
            <input type="range" v-model.number="detectionConfig.maxHeight"
                   min="50" max="500" step="10" @input="updateDetectionConfig" />
          </div>

          <div class="control-group">
            <label>置信度阈值: {{ Math.round(detectionConfig.confidenceThreshold * 100) }}%</label>
            <input type="range" v-model.number="detectionConfig.confidenceThreshold"
                   min="0.3" max="1.0" step="0.05" @input="updateDetectionConfig" />
          </div>
        </div>

        <div class="detection-actions">
          <button @click="loadTilesAndDetect" class="btn-load" :disabled="isDetecting">
            {{ isDetecting ? '🔄 检测中...' : '📁 加载3D Tiles' }}
          </button>

          <button @click="redetectBuildings" class="btn-redetect"
                  :disabled="!buildingDetector || isDetecting">
            🔄 重新检测
          </button>

          <button @click="addDetectedBuildings" class="btn-add"
                  :disabled="detectedBuildingsCount === 0">
            ➕ 添加到楼体列表
          </button>
        </div>
        <!-- 新增：手动坐标调整面板 -->
        <div class="coordinate-adjustment" v-if="showCoordinateAdjustment">
          <h5>🔧 手动坐标调整</h5>
          <p class="adjustment-tip">点击地图上的位置来调整所选楼体的坐标</p>

          <div class="selected-building-info" v-if="selectedBuildingForAdjustment">
            <div class="building-name">{{ selectedBuildingForAdjustment.name }}</div>
            <div class="current-coords">
              当前坐标: {{ selectedBuildingForAdjustment.longitude.toFixed(6) }},
              {{ selectedBuildingForAdjustment.latitude.toFixed(6) }}
            </div>
          </div>

          <div class="adjustment-controls">
            <select v-model="selectedBuildingIdForAdjustment" @change="selectBuildingForAdjustment">
              <option value="">选择要调整的楼体</option>
              <option v-for="building in detectedBuildings" :key="building.id" :value="building.id">
                {{ building.name }}
              </option>
            </select>

            <div class="adjustment-buttons">
              <button @click="startCoordinateAdjustment" class="btn-start-adjustment"
                      :disabled="!selectedBuildingForAdjustment">
                🎯 开始调整
              </button>
              <button @click="finishCoordinateAdjustment" class="btn-finish-adjustment"
                      :disabled="!isAdjustingCoordinates">
                ✅ 完成调整
              </button>
              <button @click="cancelCoordinateAdjustment" class="btn-cancel-adjustment"
                      v-if="isAdjustingCoordinates">
                ❌ 取消调整
              </button>
            </div>
          </div>
        </div>

        <!-- 手动坐标调整切换按钮 -->
        <button @click="toggleCoordinateAdjustment" class="btn-toggle-adjustment">
          {{ showCoordinateAdjustment ? '📐 隐藏坐标调整' : '🔧 手动坐标调整' }}
        </button>
      </div>
      <!-- 坐标调整模式提示 -->
      <div class="adjustment-hint" v-if="isAdjustingCoordinates">
        <div class="hint-content">
          🎯 坐标调整模式已激活
          <br>点击地图设置 "{{ selectedBuildingForAdjustment?.name }}" 的新位置
        </div>
      </div>
    </div>

    <!-- 检测面板切换按钮 -->
    <div class="detection-toggle" @click="toggleDetectionPanel"
         :class="{ active: showDetectionPanel }">
      🔍
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as Cesium from 'cesium'
import { useBaseStationStore } from '../stores/baseStations'
import { nanoid } from 'nanoid'
import {type Building, type SignalStrengthResult} from '../types.ts'
import { calculateBestSignal,   } from '../utils/propagationModels'
import { AntennaRayVisualization } from '../utils/antennaVisualization'
import { ThreeJSRayTracingManager } from '../utils/threejsRayTracing'
import { useBuildingStore } from '../stores/buildings'
import { getBuildingMaterial } from '../utils/buildingMaterials'
import {getWallPenetrationDetector} from "../utils/wallPenetrationDetector.ts";
import { BuildingDetector, type BuildingDetectionConfig } from '../utils/buildingDetector'
const store = useBaseStationStore()
const buildingStore = useBuildingStore()

const cesiumContainer = ref<HTMLElement | null>(null)
let viewer: Cesium.Viewer
// 新增：3D Tiles相关的Map来存储tileset实例
const tilesetMap = new Map<string, Cesium.Cesium3DTileset>()

// 新增：楼体检测相关状态
const showDetectionPanel = ref(false)
const isDetecting = ref(false)
const buildingDetector = ref<BuildingDetector | null>(null)
const detectedBuildingsCount = ref(0)
const tilesetStatus = ref('未加载')
const detectedBuildings = ref<Building[]>([])

// 在现有状态变量后添加：
// 新增：手动坐标调整相关状态
const showCoordinateAdjustment = ref(false)
const isAdjustingCoordinates = ref(false)
const selectedBuildingIdForAdjustment = ref('')
const selectedBuildingForAdjustment = ref<Building | null>(null)
const originalCoordinates = ref<{longitude: number, latitude: number} | null>(null)
// 检测配置
const detectionConfig = ref<BuildingDetectionConfig>({
  minHeight: 5,
  maxHeight: 300,
  minBaseArea: 25,
  maxBaseArea: 10000,
  minAspectRatio: 0.2,
  maxAspectRatio: 5.0,
  minRegularity: 0.3,
  confidenceThreshold: 0.6
})

// 新增：楼体检测相关函数
function toggleDetectionPanel() {
  showDetectionPanel.value = !showDetectionPanel.value
}

function updateDetectionConfig() {
  if (buildingDetector.value) {
    buildingDetector.value.updateConfig(detectionConfig.value)
  }
}

async function loadTilesAndDetect() {
  if (isDetecting.value) return

  try {
    isDetecting.value = true
    tilesetStatus.value = '加载中...'

    // 3D Tiles文件路径 - 根据你的实际路径调整
    const tilesetUrl = '3dtiles/tileset.json'

    if (!buildingDetector.value) {
      buildingDetector.value = new BuildingDetector(viewer)
    }

    const result = await buildingDetector.value.loadAndDetectBuildings(tilesetUrl)

    detectedBuildings.value = result.buildings
    detectedBuildingsCount.value = result.buildings.length
    tilesetStatus.value = '已加载'

    console.log(`✅ 3D Tiles加载完成，检测到 ${result.buildings.length} 个楼体`)

  } catch (error) {
    console.error('❌ 3D Tiles加载或楼体检测失败:', error)
    tilesetStatus.value = '加载失败'
    showInfoWindow(106.6148619, 29.5391032, '3D Tiles加载失败，请检查文件路径')
  } finally {
    isDetecting.value = false
  }
}

async function redetectBuildings() {
  if (!buildingDetector.value || isDetecting.value) return

  try {
    isDetecting.value = true

    const buildings = await buildingDetector.value.redetectBuildings()
    detectedBuildings.value = buildings
    detectedBuildingsCount.value = buildings.length

    console.log(`🔄 重新检测完成，发现 ${buildings.length} 个楼体`)

  } catch (error) {
    console.error('❌ 重新检测楼体失败:', error)
  } finally {
    isDetecting.value = false
  }
}

function addDetectedBuildings() {
  if (detectedBuildings.value.length === 0) return

  detectedBuildings.value.forEach(building => {
    buildingStore.addBuilding(building)
  })

  console.log(`➕ 已添加 ${detectedBuildings.value.length} 个检测到的楼体到管理列表`)
  showInfoWindow(106.6148619, 29.5391032, `已添加 ${detectedBuildings.value.length} 个楼体`)
}
// 显示信号强度信息窗口
function showSignalStrengthInfo(
    lon: number,
    lat: number,
    height: number,
    results: SignalStrengthResult[]
) {
  // 移除之前的查询结果
  const existingEntity = viewer.entities.getById('signal-query-result')
  if (existingEntity) {
    viewer.entities.remove(existingEntity)
  }

  // 创建信息内容
  const bestSignal = results[0]
  const stationName = store.stations.find(s => s.id === bestSignal.stationId)?.name || '未知基站'
  // 构建简洁的信息文本，避免过长导致截断
  let infoText = `信号强度查询\n`
  infoText += `坐标: ${lat.toFixed(6)}°, ${lon.toFixed(6)}°\n\n`
  infoText += `最强信号:\n`
  infoText += `基站: ${stationName}\n`
  infoText += `RSSI: ${bestSignal.rssi.toFixed(2)} dBm\n`
  infoText += `距离: ${bestSignal.distance.toFixed(1)} m\n`
  infoText += `路径损耗: ${bestSignal.pathLoss.toFixed(2)} dB\n`
  infoText += `传播模型: ${bestSignal.model}\n`

  if (results.length > 1) {
    infoText += `\n其他信号源 (${results.length - 1}个):\n`
    results.slice(1, 4).forEach((result, index) => {
      const station = store.stations.find(s => s.id === result.stationId)
      infoText += `${index + 2}. ${station?.name}: ${result.rssi.toFixed(1)} dBm\n`
    })
  }
// 如果使用AWM模型，显示详细信息
  if (bestSignal.awmDetails) {
    const awm = bestSignal.awmDetails
    infoText += `\n--- AWM模型详情 ---\n`
    infoText += `自由空间损耗: ${awm.breakdown.freeSpaceLoss.toFixed(2)} dB\n`
    infoText += `穿透墙体数: ${awm.penetrationResult.wallCount}\n`
    infoText += `墙体损耗: ${awm.breakdown.wallLoss.toFixed(2)} dB\n`
    infoText += `阴影衰落: ${awm.breakdown.shadowFading.toFixed(2)} dB\n`

    if (awm.penetrationResult.penetratedBuildings.length > 0) {
      infoText += `穿透楼体:\n`
      awm.penetrationResult.penetratedBuildings.slice(0, 3).forEach((building: any, index: number) => {
        infoText += `  ${index + 1}. ${building.building.name} (${building.penetrationPoints}墙)\n`
      })
    }

    // 可视化穿透路径
    const detector = getWallPenetrationDetector(viewer)
    detector.visualizePenetrationPath(awm.penetrationResult, `awm-path-${bestSignal.antennaId}`)

    // 3秒后清除路径可视化
    setTimeout(() => {
      detector.clearVisualization(`awm-path-${bestSignal.antennaId}`)
    }, 5000)
  }

  // 在地图上显示查询点和信息
  viewer.entities.add({
    id: 'signal-query-result',
    position: Cesium.Cartesian3.fromDegrees(lon, lat, height + 2),
    point: {
      pixelSize: 12,
      color: getSignalStrengthColor(bestSignal.rssi),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.NONE
    },
    label: {
      text: infoText,
      font: '11px monospace, Microsoft YaHei, sans-serif', // 使用等宽字体，确保对齐
      pixelOffset: new Cesium.Cartesian2(20, -80), // 适当调整位置
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 1,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      // 背景设置 - 关键：给足够空间
      backgroundColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.9)'),
      backgroundPadding: new Cesium.Cartesian2(25, 15), // 增大内边距，确保文本有足够空间
      showBackground: true,
      // 显示控制
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      // 对齐方式
      horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      // 固定尺寸和位置
      heightReference: Cesium.HeightReference.NONE,
      scale: 1.0,
      // 添加这些属性确保文本完整显示
      eyeOffset: new Cesium.Cartesian3(0, 0, 0),
      pixelOffsetScaleByDistance: undefined, // 禁用像素偏移缩放
      scaleByDistance: undefined, // 禁用距离缩放
      translucencyByDistance: undefined, // 禁用距离透明度

    }
  })

  // 3秒后自动隐藏查询结果
  setTimeout(() => {
    const entity = viewer.entities.getById('signal-query-result')
    if (entity) {
      viewer.entities.remove(entity)
    }
  }, 3000)
}

// 根据信号强度返回颜色
function getSignalStrengthColor(rssi: number): Cesium.Color {
  if (rssi > -60) return Cesium.Color.GREEN        // 极强信号
  if (rssi > -70) return Cesium.Color.LIME         // 强信号
  if (rssi > -80) return Cesium.Color.YELLOW       // 中等信号
  if (rssi > -90) return Cesium.Color.ORANGE       // 弱信号
  if (rssi > -100) return Cesium.Color.RED         // 很弱信号
  return Cesium.Color.GRAY                         // 极弱/无信号
}

// 简单信息显示函数
function showInfoWindow(lon: number, lat: number, message: string) {
  const existingEntity = viewer.entities.getById('info-message')
  if (existingEntity) {
    viewer.entities.remove(existingEntity)
  }

  viewer.entities.add({
    id: 'info-message',
    position: Cesium.Cartesian3.fromDegrees(lon, lat, 10),
    label: {
      text: message,
      font: '12px sans-serif',
      fillColor: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE
    }
  })

  setTimeout(() => {
    const entity = viewer.entities.getById('info-message')
    if (entity) viewer.entities.remove(entity)
  }, 7000)
}
// 添加楼体创建函数
function createBuilding(lon: number, lat: number) {
  const id = nanoid()
  const defaultMaterial = getBuildingMaterial('concrete')!

  const newBuilding: Building = {
    id,
    name: `楼体-${id.slice(0, 4)}`,
    longitude: lon,
    latitude: lat,
    height: 30,
    width: 20,
    length: 20,
    floors: 10,
    rotation: 0,
    wallLoss: defaultMaterial.wallLoss,
    roofLoss: defaultMaterial.roofLoss,
    floorLoss: defaultMaterial.floorLoss,
    materialType: 'concrete',
    color: defaultMaterial.color,
    opacity: 0.8,
    sourceType: 'manual' // 新增：标记为手动创建

  }
  console.log('🏗️ 创建新楼体:', newBuilding) // 🔍 添加调试日志
  console.log('楼体sourceType:', newBuilding.sourceType)
  // 在3D地图中添加楼体
  addBuildingToMap(newBuilding)

  // 保存楼体数据到store
  buildingStore.addBuilding(newBuilding)
  buildingStore.selectBuilding(id)
  buildingStore.setBuildingCreationMode(false) // 创建后退出创建模式
}


// 在地图上添加楼体
function addBuildingToMap(building: Building) {
  if (building.sourceType === 'imported' && building.tilesetInfo) {
    console.log(`🔍 添加3D Tiles楼体: ${building.name} (${building.id})`)
    addBoxBuildingToMap(building)
  } else {
    // 原有的Box渲染逻辑保持不变
    addBoxBuildingToMap(building)
  }

}
// 新增：添加3D Tiles楼体到地图
async function addTilesetToMap(building: Building) {
  if (!building.tilesetInfo || !building.originalPath) return

  try {
    // 构建tileset URL（这里需要根据实际情况调整）
    const tilesetUrl = `/3dtitlebuilding/${building.originalPath}/tileset.json`


    // 创建3D Tileset
    const tileset = viewer.scene.primitives.add(
        new Cesium.Cesium3DTileset({
          url: tilesetUrl,
          show: true,
          // 可选：调整tileset的位置和缩放
          modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(
              Cesium.Cartesian3.fromDegrees(
                  building.longitude,
                  building.latitude,
                  0
              )
          )
        } as any)
    )

    // 存储tileset引用
    tilesetMap.set(building.id, tileset)

    //设置tileset属性
    tileset.readyPromise.then(() => {
      console.log(`3D Tileset ${building.name} 加载完成`)

      // 应用楼体的透明度设置
      tileset.style = new Cesium.Cesium3DTileStyle({
        color: {
          conditions: [
            ['true', `color('${building.color}', ${building.opacity})`]
          ]
        }
      })
    }).catch(error => {
      console.error(`3D Tileset ${building.name} 加载失败:`, error)
      // 如果3D Tiles加载失败，回退到Box渲染
      addBoxBuildingToMap(building)
    })

    //添加标签
    viewer.entities.add({
      id: `${building.id}_label`,
      position: Cesium.Cartesian3.fromDegrees(
          building.longitude,
          building.latitude,
          building.height + 10
      ),
      label: {
        text: `${building.name}\n${building.width}×${building.length}×${building.height}m\n${building.floors}层\n[3D Tiles]`,
        font: '12px sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -30),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      }
    })

  } catch (error) {
    console.error(`添加3D Tileset ${building.name} 失败:`, error)
    // 回退到Box渲染
    addBoxBuildingToMap(building)
  }
}

// 新增：原有的Box楼体渲染逻辑（从原来的addBuildingToMap中提取）
function addBoxBuildingToMap(building: Building) {
  const buildingEntity = viewer.entities.add({
    id: building.id,
    position: Cesium.Cartesian3.fromDegrees(building.longitude, building.latitude, 0),
    box: {
      dimensions: new Cesium.Cartesian3(building.width, building.length, building.height),
      material: Cesium.Color.fromCssColorString(building.color).withAlpha(building.opacity),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString(building.color).withAlpha(1.0),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    },
    label: {
      text: `${building.name}\n${building.width}×${building.length}×${building.height}m\n${building.floors}层`,
      font: '12px sans-serif',
      pixelOffset: new Cesium.Cartesian2(0, -building.height/2 - 30),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    }
  })

  // 设置楼体旋转
  if (building.rotation !== 0) {
    const heading = Cesium.Math.toRadians(building.rotation)
    const hpr = new Cesium.HeadingPitchRoll(heading, 0, 0)
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(
        Cesium.Cartesian3.fromDegrees(building.longitude, building.latitude, building.height/2),
        hpr
    )
    buildingEntity.orientation = new Cesium.ConstantProperty(orientation)
  }
}
// 在现有函数后添加：
function toggleCoordinateAdjustment() {
  showCoordinateAdjustment.value = !showCoordinateAdjustment.value
  if (!showCoordinateAdjustment.value) {
    cancelCoordinateAdjustment()
  }
}

function selectBuildingForAdjustment() {
  const building = detectedBuildings.value.find(b => b.id === selectedBuildingIdForAdjustment.value)
  selectedBuildingForAdjustment.value = building || null
}

function startCoordinateAdjustment() {
  if (!selectedBuildingForAdjustment.value) return

  isAdjustingCoordinates.value = true
  originalCoordinates.value = {
    longitude: selectedBuildingForAdjustment.value.longitude,
    latitude: selectedBuildingForAdjustment.value.latitude
  }

  console.log(`🎯 开始调整楼体坐标: ${selectedBuildingForAdjustment.value.name}`)
  showInfoWindow(
      selectedBuildingForAdjustment.value.longitude,
      selectedBuildingForAdjustment.value.latitude,
      '坐标调整模式已激活，点击地图设置新位置'
  )
}

function finishCoordinateAdjustment() {
  if (!selectedBuildingForAdjustment.value) return

  isAdjustingCoordinates.value = false
  originalCoordinates.value = null

  console.log(`✅ 完成楼体坐标调整: ${selectedBuildingForAdjustment.value.name}`)
  showInfoWindow(
      selectedBuildingForAdjustment.value.longitude,
      selectedBuildingForAdjustment.value.latitude,
      `楼体 "${selectedBuildingForAdjustment.value.name}" 坐标调整完成`
  )
}

function cancelCoordinateAdjustment() {
  if (isAdjustingCoordinates.value && selectedBuildingForAdjustment.value && originalCoordinates.value) {
    // 恢复原始坐标
    selectedBuildingForAdjustment.value.longitude = originalCoordinates.value.longitude
    selectedBuildingForAdjustment.value.latitude = originalCoordinates.value.latitude

    console.log(`❌ 取消楼体坐标调整: ${selectedBuildingForAdjustment.value.name}`)
  }

  isAdjustingCoordinates.value = false
  originalCoordinates.value = null
}

function adjustBuildingCoordinates(lon: number, lat: number) {
  if (!selectedBuildingForAdjustment.value) return

  const oldLon = selectedBuildingForAdjustment.value.longitude
  const oldLat = selectedBuildingForAdjustment.value.latitude

  // 更新楼体坐标
  selectedBuildingForAdjustment.value.longitude = lon
  selectedBuildingForAdjustment.value.latitude = lat

  console.log(`🔧 调整楼体坐标: ${selectedBuildingForAdjustment.value.name}`)
  console.log(`   从 (${oldLon.toFixed(6)}, ${oldLat.toFixed(6)})`)
  console.log(`   到 (${lon.toFixed(6)}, ${lat.toFixed(6)})`)

  // 在地图上更新楼体位置（如果已经添加到地图）
  const buildingEntity = viewer.entities.getById(selectedBuildingForAdjustment.value.id)
  if (buildingEntity) {
    buildingEntity.position = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.fromDegrees(lon, lat, selectedBuildingForAdjustment.value.height / 2)
    )
  }

  showInfoWindow(lon, lat, `已调整 "${selectedBuildingForAdjustment.value.name}" 到新位置`)
}

onMounted(async () => {
      if (!cesiumContainer.value) return
      console.time('Cesium初始化总时间');
      Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlMWY2MDczNi00NjRlLTRkOWEtYWI0ZC05MzdjNGY1YmYzMmQiLCJpZCI6MzA3NDE4LCJpYXQiOjE3NDg1MTA2NjR9.wu0g_HLWWoPqgC6nrStoXVoSEql8QAQSuSTB2wmweRs'
      // 初始化Cesium场景
      viewer = new Cesium.Viewer(cesiumContainer.value, {
        //terrain: Cesium. Terrain. fromWorldTerrain(),
        baseLayerPicker: false,


      });
      console.timeEnd('Cesium初始化总时间');
      console.time('地图图层加载');
      // 添加高德卫星图（底图）
      const satelliteLayer = new Cesium.UrlTemplateImageryProvider({
        url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
        subdomains: ['1', '2', '3', '4'],
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        maximumLevel: 18
      });
      viewer.imageryLayers.addImageryProvider(satelliteLayer);

      // 添加高德标注图（覆盖层）
      const labelLayer = new Cesium.UrlTemplateImageryProvider({
        url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}',
        subdomains: ['1', '2', '3', '4'],
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        maximumLevel: 18
      });
      viewer.imageryLayers.addImageryProvider(labelLayer);
      console.timeEnd('地图图层加载');
      const geometricRayVisualization = new AntennaRayVisualization(viewer)
      const threeJSRayTracingManager = new ThreeJSRayTracingManager(viewer)
      console.time('事件监听器设置');
      // 设置默认视角到重庆市
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(106.6148619, 29.5391032, 200), // 重庆坐标，高度50km
        orientation: {
          heading: Cesium.Math.toRadians(0),     // 正北方向
          pitch: Cesium.Math.toRadians(-30),     // 俯视角度45度
          roll: 0.0
        }
      })
      // 处理地图点击事件 - 添加基站
      viewer.screenSpaceEventHandler.setInputAction((event: any) => {


        const cartesian = viewer.scene.pickPosition(event.position)
        if (!cartesian) return

        // 转换为经纬度坐标
        const carto = Cesium.Cartographic.fromCartesian(cartesian)
        const lon = Cesium.Math.toDegrees(carto.longitude)
        const lat = Cesium.Math.toDegrees(carto.latitude)

        const id = nanoid()
        const defaultHeight = 30 // 默认基站高度30米


        // 检查是否处于楼体创建模式
        if (buildingStore.isCreatingBuilding) {
          createBuilding(lon, lat)
          return
        }
        // 检查是否处于宏站创建模式
        if (!store.isCreatingMode) return
        // 在3D地图中添加基站图标和标签
        viewer.entities.add({
          id,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
          billboard: {
            image: '/station-icon1.png',
            scale: 0.1,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
          },
          label: {
            text: `宏站-${id.slice(0, 4)}\n高度: ${defaultHeight}m`,
            font: '12px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -40),
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE

          }
        })
        const positionCartographic = Cesium.Cartographic.fromDegrees(lon, lat);
        const terrainHeight = viewer.scene.globe.getHeight(positionCartographic); // 异步获取地形高度
        const endHeight = defaultHeight + (terrainHeight || 0); // 如果地形高度为0，则使用默认高度
        console.log(`地形高度: ${terrainHeight}米`)
        // 添加基站支撑杆（从地面到基站的线条）
        viewer.entities.add({
          id: `${id}_pole`,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(lon, lat, 0),
              Cesium.Cartesian3.fromDegrees(lon, lat, defaultHeight)
            ],
            width: 7,
            material: Cesium.Color.GRAY.withAlpha(0.8),
            clampToGround: false
          }
        })

        // 保存基站数据到store
        store.addStation({
          id,
          name: `宏站-${id.slice(0, 4)}`,
          longitude: lon,
          latitude: lat,
          height: defaultHeight,
          antennas: []
        })

        store.selectStation(id)

      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)


      // ========== 新增：射线追踪模式切换事件 ==========
      window.addEventListener('updateRayTracingMode', (event: any) => {
        const {stationId, antennaId, antenna} = event.detail
        const station = store.stations.find(s => s.id === stationId)
        console.log('更新射线追踪模式', antenna.rayTracingType)
        if (station && antenna) {
          // 清除所有射线追踪显示
          geometricRayVisualization.clearAntenna(antennaId)

          threeJSRayTracingManager.clearAntenna(antennaId)

          // 根据选择的模式启用对应的射线追踪
          switch (antenna.rayTracingType) {
            case 'geometric':
              if (antenna.visualization.enabled) {
                geometricRayVisualization.renderAntenna(station, antenna)
              }
              break

            case 'threejs':
              if (antenna.threeJSRayTracing.enabled) {
                threeJSRayTracingManager.enable(antenna.threeJSRayTracing)
                threeJSRayTracingManager.renderAntenna(station, antenna)
              }
              break


          }
        }
      })
      // 添加右键点击事件 - 信号强度查询
      viewer.screenSpaceEventHandler.setInputAction((event: any) => {
        const cartesian = viewer.scene.pickPosition(event.position)
        if (!cartesian) return

        // 转换为经纬度坐标
        const carto = Cesium.Cartographic.fromCartesian(cartesian)
        const lon = Cesium.Math.toDegrees(carto.longitude)
        const lat = Cesium.Math.toDegrees(carto.latitude)
        const height = 1.5 // 默认接收点高度1.5米
        // 检查是否处于坐标调整模式 - 新增这部分
        if (isAdjustingCoordinates.value) {
          adjustBuildingCoordinates(lon, lat)
          return
        }
        // 计算所有基站天线的信号强度
        const signalResults = calculateBestSignal(store.stations, lat, lon, height, viewer)

        if (signalResults.length === 0) {
          showInfoWindow(lon, lat, '没有可用的基站信号')
          return
        }

        // 显示信号强度查询结果
        showSignalStrengthInfo(lon, lat, height, signalResults)

      }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
      // 监听基站数据变化，实时更新3D显示
      watch(() => store.stations, (newStations) => {
        newStations.forEach(station => {
          const entity = viewer.entities.getById(station.id)
          const poleEntity = viewer.entities.getById(`${station.id}_pole`)

          if (entity) {
            // 更新基站位置和标签
            entity.position = new Cesium.ConstantPositionProperty(
                Cesium.Cartesian3.fromDegrees(
                    station.longitude,
                    station.latitude,
                    station.height
                )
            )

            if (entity.label) {
              entity.label.text = new Cesium.ConstantProperty(`${station.name}\n高度: ${station.height}m`)
            }
          }

          // 更新支撑杆
          if (poleEntity && poleEntity.polyline) {
            poleEntity.polyline.positions = new Cesium.ConstantProperty([
              Cesium.Cartesian3.fromDegrees(station.longitude, station.latitude, 0),
              Cesium.Cartesian3.fromDegrees(station.longitude, station.latitude, station.height)
            ])
          }
        })
      }, {deep: true})
      //监听监听楼体数据变化，实时更新3D显示
      watch(() => buildingStore.buildings, (newBuildings) => {
        console.log('楼体数据变化，更新地图显示')

        newBuildings.forEach(building => {
          // 检查是否是3D Tiles楼体
          if (building.sourceType === 'imported' && building.tilesetInfo) {
            // 3D Tiles楼体的更新逻辑
            const tileset = tilesetMap.get(building.id)
            if (tileset) {
              // 更新3D Tiles的样式
              tileset.style = new Cesium.Cesium3DTileStyle({
                color: {
                  conditions: [
                    ['true', `color('${building.color}', ${building.opacity})`]
                  ]
                }
              })
            } else {
              // 如果tileset不存在，重新创建
              addTilesetToMap(building)
              //loadTileset(building)
            }

            // 更新标签
            const labelEntity = viewer.entities.getById(`${building.id}_label`)
            if (labelEntity && labelEntity.label) {
              labelEntity.position = new Cesium.ConstantPositionProperty(
                  Cesium.Cartesian3.fromDegrees(building.longitude, building.latitude, building.height + 10)
              )
              labelEntity.label.text = new Cesium.ConstantProperty(
                  `${building.name}\n${building.width}×${building.length}×${building.height}m\n${building.floors}层\n[3D Tiles]`
              )
            }
          } else {
            // 原有的Box楼体更新逻辑保持不变
            const entity = viewer.entities.getById(building.id)
            if (entity && entity.box) {
              console.log('更新楼体:', building.name)

              // 更新楼体位置
              entity.position = new Cesium.ConstantPositionProperty(
                  Cesium.Cartesian3.fromDegrees(building.longitude, building.latitude, building.height / 2)
              )

              // 更新楼体尺寸
              entity.box.dimensions = new Cesium.ConstantProperty(
                  new Cesium.Cartesian3(building.width, building.length, building.height)
              )

              // 更新楼体材质
              entity.box.material = new Cesium.ColorMaterialProperty(
                  Cesium.Color.fromCssColorString(building.color).withAlpha(building.opacity)
              );
              // 更新轮廓颜色
              entity.box.outlineColor = new Cesium.ConstantProperty(
                  Cesium.Color.fromCssColorString(building.color)
              )

              // 更新标签
              if (entity.label) {
                entity.label.text = new Cesium.ConstantProperty(
                    `${building.name}\n${building.width}×${building.length}×${building.height}m\n${building.floors}层`
                )
                entity.label.pixelOffset = new Cesium.ConstantProperty(
                    new Cesium.Cartesian2(0, -building.height / 2 - 30)
                )
              }

              // 更新旋转
              if (building.rotation !== 0) {
                const heading = Cesium.Math.toRadians(building.rotation)
                const hpr = new Cesium.HeadingPitchRoll(heading, 0, 0)
                const orientation = Cesium.Transforms.headingPitchRollQuaternion(
                    Cesium.Cartesian3.fromDegrees(building.longitude, building.latitude, building.height / 2),
                    hpr
                )
                entity.orientation = new Cesium.ConstantProperty(orientation)
              }
            } else {
              addBoxBuildingToMap(building)
            }
          }
        })
      }, {deep: true})


      // 4. 修复：监听删除楼体事件
      window.addEventListener('removeBuildingFromMap', (event: any) => {
        const {buildingId, building} = event.detail
        console.log('删除楼体事件:', buildingId, building?.name)

        const entity = viewer.entities.getById(buildingId)
        if (entity) {
          viewer.entities.remove(entity)
          console.log('楼体已从地图删除:', buildingId)
        } else {
          console.warn('要删除的楼体不存在:', buildingId)
        }
      })
// 5. 修复：监听楼体更新事件
      window.addEventListener('updateBuildingOnMap', (event: any) => {
        const {buildingId, building} = event.detail
        console.log('更新楼体事件:', buildingId, building?.name)

        // 移除旧的实体
        const oldEntity = viewer.entities.getById(buildingId)
        if (oldEntity) {
          viewer.entities.remove(oldEntity)
        }

        // 添加新的实体
        addBuildingToMap(building)
      })
      // 监听删除基站事件
      window.addEventListener('removeStationFromMap', (event: any) => {
        const {stationId, station} = event.detail
        const entity = viewer.entities.getById(stationId)
        const poleEntity = viewer.entities.getById(`${stationId}_pole`)

        console.log(station)
        // 清除该基站所有天线的射线可视化
        if (station) {
          station.antennas.forEach(antenna => {
            geometricRayVisualization.clearAntenna(antenna.id)

            threeJSRayTracingManager.clearAntenna(antenna.id)  // 新增Three.js清除
          })
        }
        if (entity) viewer.entities.remove(entity)
        if (poleEntity) viewer.entities.remove(poleEntity)
      })

      // 监听飞行到基站事件
      window.addEventListener('flyToStation', (event: any) => {
        const {longitude, latitude, height} = event.detail
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height + 200),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-30),
            roll: 0.0
          },
          duration: 2.0
        })
      })
      // 修复：监听飞行到楼体事件 - 增加调试信息
      window.addEventListener('flyToBuilding', (event: any) => {
        console.log('收到飞行到楼体事件:', event)
        console.log('Event detail:', event.detail)

        if (!event.detail) {
          console.error('飞行事件detail为空!')
          return
        }

        const {buildingId, building, longitude, latitude, height, orientation} = event.detail
        console.log('飞行到楼体事件详情:', {
          buildingId,
          buildingName: building?.name,
          longitude,
          latitude,
          height
        })

        if (longitude === undefined || latitude === undefined || height === undefined) {
          console.error('飞行坐标数据不完整:', {longitude, latitude, height})
          return
        }

        console.log(`开始飞行到楼体: ${building?.name || buildingId} (${longitude}, ${latitude}, ${height})`)

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height + 150),
          orientation: orientation || {
            heading: Cesium.Math.toRadians(45),
            pitch: Cesium.Math.toRadians(-30),
            roll: 0.0
          },
          duration: 2.0
        })
      })

      //修复：监听添加楼体到地图事件（用于复制功能）
      window.addEventListener('addBuildingToMap', (event: any) => {
        const {building} = event.detail
        console.log('添加楼体到地图事件:', building?.name)
        addBuildingToMap(building)
      })

      // 监听清空所有基站事件
      window.addEventListener('clearAllStationsFromMap', () => {
        geometricRayVisualization.clearAll()

        threeJSRayTracingManager.clearAll()
        viewer.entities.removeAll()
      })
// 修复：监听清空所有楼体事件 - 增加调试信息
      window.addEventListener('clearAllBuildingsFromMap', (event) => {
        console.log('收到清空所有楼体事件:', event)

        // 移除所有楼体实体（通过box属性识别）
        const buildingEntities: Cesium.Entity[] = []
        viewer.entities.values.forEach(entity => {
          if (entity.box) { // 识别楼体实体（有box属性）
            buildingEntities.push(entity)
          }
        })

        console.log(`找到 ${buildingEntities.length} 个楼体实体待删除`)

        buildingEntities.forEach((entity, index) => {
          console.log(`删除楼体实体 ${index + 1}:`, entity.id)
          viewer.entities.remove(entity)
        })

        console.log(`✅ 已清空 ${buildingEntities.length} 个楼体`)
      })

// 修复：监听添加楼体到地图事件 - 增加调试信息
      window.addEventListener('addBuildingToMap', (event: any) => {
        console.log('收到添加楼体到地图事件:', event)
        console.log('Event detail:', event.detail)

        if (!event.detail) {
          console.error('添加楼体事件detail为空!')
          return
        }

        const {building} = event.detail
        if (!building) {
          console.error('添加楼体事件中building为空!')
          return
        }

        console.log('添加楼体到地图:', building.name, building.id)
        addBuildingToMap(building)
      })
      // 监听重新加载基站事件（用于数据导入）
      window.addEventListener('reloadStationsOnMap', (event: any) => {
        const {stations} = event.detail
        geometricRayVisualization.clearAll()

        threeJSRayTracingManager.clearAll()
        viewer.entities.removeAll()

        stations.forEach((station: any) => {
          // 重新添加基站实体
          viewer.entities.add({
            id: station.id,
            position: Cesium.Cartesian3.fromDegrees(station.longitude, station.latitude, station.height),
            billboard: {
              image: '/station-icon.png',
              scale: 0.6,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              heightReference: Cesium.HeightReference.NONE
            },
            label: {
              text: `${station.name}\n高度: ${station.height}m`,
              font: '12px sans-serif',
              pixelOffset: new Cesium.Cartesian2(0, -40),
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE
            }
          })

          // 重新添加支撑杆
          viewer.entities.add({
            id: `${station.id}_pole`,
            polyline: {
              positions: [
                Cesium.Cartesian3.fromDegrees(station.longitude, station.latitude, 0),
                Cesium.Cartesian3.fromDegrees(station.longitude, station.latitude, station.height)
              ],
              width: 3,
              material: Cesium.Color.GRAY.withAlpha(0.8),
              clampToGround: false
            }
          })
          // 重新渲染启用的天线射线
          station.antennas.forEach((antenna: any) => {
            if (antenna.visualization?.enabled) {
              geometricRayVisualization.renderAntenna(station, antenna)
            }
          })
        })
      })
      // ========== 修改：现有的天线可视化更新事件，支持多种模式
      window.addEventListener('updateAntennaVisualization', (event: any) => {
        const {stationId, antennaId, antenna} = event.detail
        const station = store.stations.find(s => s.id === stationId)

        if (station && antenna) {

          // 根据当前射线追踪类型更新相应的可视化
          switch (antenna.rayTracingType) {
            case 'geometric':
              if (antenna.visualization.enabled) {
                geometricRayVisualization.renderAntenna(station, antenna)
              } else {
                geometricRayVisualization.clearAntenna(antennaId)
              }
              break

            case 'threejs':
              if (antenna.threeJSRayTracing.enabled) {
                console.log('更新天线可视化', antennaId, antenna.rayTracingType, antenna.threeJSRayTracing.enabled)
                threeJSRayTracingManager.renderAntenna(station, antenna)
              } else {
                threeJSRayTracingManager.clearAntenna(antennaId)
              }
              break


          }
        }
      })
// 监听基站位置更新事件
      window.addEventListener('updateStationPosition', (event: any) => {
        const {stationId, longitude, latitude, height} = event.detail
        const entity = viewer.entities.getById(stationId)
        const poleEntity = viewer.entities.getById(`${stationId}_pole`)

        if (entity) {
          // 更新基站位置
          entity.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(longitude, latitude, height))
        }

        if (poleEntity && poleEntity.polyline) {
          // 更新支撑杆位置
          poleEntity.polyline.positions = new Cesium.ConstantProperty([
            Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
            Cesium.Cartesian3.fromDegrees(longitude, latitude, height)
          ])
        }
      })
      // 监听删除天线可视化事件
      window.addEventListener('removeAntennaVisualization', (event: any) => {
        const {antennaId} = event.detail
        geometricRayVisualization.clearAntenna(antennaId)
        threeJSRayTracingManager.clearAntenna(antennaId)
      })
      console.timeEnd('事件监听器设置');
    }

)


</script>

<style scoped>
#cesiumContainer {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  position: relative;
}
/* 楼体检测面板样式 */
.detection-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 320px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px 12px 0 0;
}

.panel-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.panel-content {
  padding: 20px;
}

.detection-status {
  margin-bottom: 20px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
}

.status-item span:first-child {
  color: #666;
}

.status-item span:last-child {
  font-weight: 600;
  color: #2c3e50;
}

.detected-count {
  background: #e8f5e8;
  color: #2e7d32;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.detection-controls {
  margin-bottom: 20px;
  padding: 15px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
}

.detection-controls h5 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 14px;
}

.control-group {
  margin-bottom: 15px;
}

.control-group label {
  display: block;
  font-size: 12px;
  color: #555;
  margin-bottom: 5px;
  font-weight: 500;
}

.control-group input[type="range"] {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #ddd;
  outline: none;
  -webkit-appearance: none;
}

.control-group input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.detection-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detection-actions button {
  padding: 10px 15px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-load {
  background: #4CAF50;
  color: white;
}

.btn-load:hover:not(:disabled) {
  background: #45a049;
}

.btn-redetect {
  background: #2196F3;
  color: white;
}

.btn-redetect:hover:not(:disabled) {
  background: #1976D2;
}

.btn-add {
  background: #FF9800;
  color: white;
}

.btn-add:hover:not(:disabled) {
  background: #F57C00;
}

.detection-actions button:disabled {
  background: #ccc;
  cursor: not-allowed;
  opacity: 0.6;
}

/* 检测面板切换按钮 */
.detection-toggle {
  position: absolute;
  top: 20px;
  right: 360px;
  width: 50px;
  height: 50px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 20px;
  transition: all 0.3s;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 999;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.detection-toggle:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}

.detection-toggle.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .detection-panel {
    width: calc(100vw - 40px);
    top: 10px;
    right: 20px;
  }

  .detection-toggle {
    right: 20px;
    top: 80px;
  }
}
/* 新增：手动坐标调整面板样式 */
.coordinate-adjustment {
  margin-top: 20px;
  padding: 15px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.coordinate-adjustment h5 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 14px;
}

.adjustment-tip {
  font-size: 12px;
  color: #666;
  margin-bottom: 15px;
  padding: 8px;
  background: rgba(255, 193, 7, 0.1);
  border-radius: 4px;
  border-left: 3px solid #ffc107;
}

.selected-building-info {
  background: rgba(33, 150, 243, 0.1);
  padding: 10px;
  border-radius: 6px;
  margin-bottom: 15px;
  border-left: 3px solid #2196F3;
}

.building-name {
  font-weight: 600;
  color: #1976D2;
  margin-bottom: 4px;
}

.current-coords {
  font-size: 11px;
  color: #666;
  font-family: monospace;
}

.adjustment-controls select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  margin-bottom: 10px;
}

.adjustment-buttons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn-start-adjustment {
  background: #4CAF50;
  color: white;
}

.btn-start-adjustment:hover:not(:disabled) {
  background: #45a049;
}

.btn-finish-adjustment {
  background: #2196F3;
  color: white;
}

.btn-finish-adjustment:hover:not(:disabled) {
  background: #1976D2;
}

.btn-cancel-adjustment {
  background: #f44336;
  color: white;
}

.btn-cancel-adjustment:hover {
  background: #d32f2f;
}

.btn-toggle-adjustment {
  background: #607D8B;
  color: white;
  margin-top: 15px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-toggle-adjustment:hover {
  background: #546E7A;
}

/* 坐标调整模式提示 */
.adjustment-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 193, 7, 0.95);
  backdrop-filter: blur(10px);
  color: #000;
  padding: 20px 30px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  z-index: 1001;
  border: 2px solid #ffc107;
  animation: pulse 2s infinite;
}

.hint-content {
  text-align: center;
  font-weight: 600;
  font-size: 14px;
  line-height: 1.4;
}

@keyframes pulse {
  0% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.05); }
  100% { transform: translate(-50%, -50%) scale(1); }
}
</style>