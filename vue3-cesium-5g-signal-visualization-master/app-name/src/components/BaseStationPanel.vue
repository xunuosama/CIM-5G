<template>
  <div class="panel">


    <!-- 左侧基站列表 -->
    <div class="list" >
      <h3>基站列表 ({{ store.totalStations }})</h3>
      <ul>
        <li
            v-for="s in store.stations"
            :key="s.id"
            @click="selectAndShowDetails(s.id)"
            :class="{ active: s.id === store.selectedId }"
        >
          <span>{{ s.name }}</span>
          <small>高度: {{ s.height }}m ({{ s.antennas.length }}天线)</small>
        </li>
      </ul>
      <div class="stats">
        <p>总基站数：{{ store.totalStations }}</p>
        <p>总天线数：{{ store.totalAntennas }}</p>
      </div>
      <div class="action-buttons">
        <button
            @click="toggleCreateMode"
            :class="{ active: store.isCreatingMode }"
            class="btn-create"
        >
          {{ store.isCreatingMode ? '🚫 取消创建' : '➕ 创建宏站' }}
        </button>

        <button
            @click="clearAllStations"
            class="btn-clear"
            :disabled="store.totalStations === 0"
        >
          🗑️ 清空所有
        </button>
      </div>

    </div>

    <!-- 右侧基站详情 -->
    <div class="details" v-if="selected  && showDetails">
      <!-- 详情面板顶部工具栏 -->
      <div class="details-header">
        <h3>{{ selected.name }}</h3>
        <button @click="hideDetails" class="btn-collapse" title="收起详情">
          ✕
        </button>
      </div>
      <h3>基站信息</h3>

      <!-- 基站基本信息编辑 -->
      <div class="info-group">
        <label>
          名称：
          <input
              v-model="selected.name"
              @input="updateStation"
              placeholder="请输入基站名称"
          />
        </label>

        <label>
          高度：
          <div class="height-input-group">
            <input
                type="number"
                v-model.number="selected.height"
                @input="updateStation"
                min="0"
                max="500"
                step="1"
                placeholder="基站高度"
            />
            <span class="unit">米</span>
          </div>
        </label>

        <div class="coordinate-info">
          <label>
            经度：
            <input
                type="number"
                v-model.number="selected.longitude"
                @input="updateStationPosition"
                min="-180"
                max="180"
                step="0.000001"
                placeholder="经度坐标"
                class="coordinate-input"
            />
            <span class="unit">°</span>
          </label>

          <label>
            纬度：
            <input
                type="number"
                v-model.number="selected.latitude"
                @input="updateStationPosition"
                min="-90"
                max="90"
                step="0.000001"
                placeholder="纬度坐标"
                class="coordinate-input"
            />
            <span class="unit">°</span>
          </label>
        </div>

        <!-- 高度快速设置按钮 -->
        <div class="height-presets">
          <span class="preset-label">快速设置：</span>
          <button @click="setHeight(15)" class="preset-btn">15m</button>
          <button @click="setHeight(30)" class="preset-btn">30m</button>
          <button @click="setHeight(50)" class="preset-btn">50m</button>
          <button @click="setHeight(80)" class="preset-btn">80m</button>
        </div>
      </div>

      <!-- 天线配置区域 -->
      <div class="antenna-section">
        <h4>天线配置 ({{ selected.antennas.length }})</h4>

        <div v-for="(antenna, index) in selected.antennas" :key="antenna.id" class="antenna-item">
          <div class="antenna-header">
            <h5>
              天线 {{ index + 1 }}
              <span class="antenna-height">
                (基站+{{ antenna.height }}m = {{ selected.height + antenna.height }}m)
              </span>
            </h5>
            <button @click="removeAntenna(antenna.id)" class="btn-remove">🗑️删除天线</button>
          </div>

          <!-- 天线参数配置 -->
          <div class="antenna-controls">
            <label>
              类型：
              <select v-model="antenna.type">
                <option>单天线</option>
                <option>多天线</option>
              </select>
            </label>
            <label>
              工作频率：
              <input
                  type="number"
                  v-model.number="antenna.frequency"
                  min="800"
                  max="6000"
                  step="1"
                  title="工作频率 MHz"
              />MHz
            </label>
            <label>
              方向角：
              <input
                  type="number"
                  v-model.number="antenna.azimuth"
                  min="0"
                  max="360"
                  step="1"
                  title="0度为正北"
              />°
            </label>

            <label>
              俯仰角：
              <input
                  type="number"
                  v-model.number="antenna.elevation"
                  min="-90"
                  max="90"
                  step="1"
                  title="0度为水平"
              />°
            </label>

            <label>
              相对高度：
              <input
                  type="number"
                  v-model.number="antenna.height"
                  min="0"
                  max="100"
                  step="0.5"
                  title="相对于基站的高度"
              />m
            </label>

            <label>
              发射功率：
              <input
                  type="number"
                  v-model.number="antenna.power"
                  step="0.1"
              />dBm
            </label>

            <label>
              增益：
              <input
                  type="number"
                  v-model.number="antenna.gain"
                  step="0.1"
              />dBi
            </label>
          </div>
          <!-- 传播模型选择 - 新增 -->
          <div class="propagation-model-section">

            <label class="model-label">
              传播模型：
              <select
                  v-model="antenna.propagationModel.type"
                  @change="updatePropagationModel(antenna)"
                  class="model-select"
              >
                <option value="free-space">Free-Space 自由空间</option>
                <option value="cost-231-hata">COST-231-Hata 城市</option>
                <option value="itu-indoor">ITU 室内</option>

                <option value="average-wall-loss-model">平均墙损模型</option>
              </select>
            </label>
            <!-- 模型描述信息 -->
            <div class="model-description">
              <small>{{ getModelDescription(antenna.propagationModel.type) }}</small>
            </div>

            <div v-if="antenna.propagationModel.parameters" class="model-parameters">

              <div v-if="antenna.propagationModel.type === 'cost-231-hata'" class="param-group">
                <label>
                  城市类型：
                  <select v-model.number="antenna.propagationModel.parameters.cityType">
                    <option :value="0">中小城市</option>
                    <option :value="1">大城市</option>
                  </select>
                </label>
              </div>
              <div v-if="antenna.propagationModel.type === 'itu-indoor'" class="param-group">
                <label>
                  墙体损耗：
                  <input
                      type="number"
                      v-model.number="antenna.propagationModel.parameters.wallLoss"
                      min="0"
                      max="30"
                      step="1"
                  />dB
                </label>
                <label>
                  楼层数：
                  <input
                      type="number"
                      v-model.number="antenna.propagationModel.parameters.floors"
                      min="1"
                      max="50"
                      step="1"
                  />
                </label>
              </div>
              <div v-if="antenna.propagationModel.type === 'average-wall-loss-model'" class="param-group">

              </div>
            </div>
          </div>

          <!-- 🔬 射线追踪模式选择 - 新增 -->
          <div class="raytracing-mode-section">
            <div class="raytracing-mode-header">
              <h5>🔬 射线追踪模式</h5>
            </div>

            <div class="raytracing-mode-selector">
              <label class="raytracing-mode-option">
                <input
                    type="radio"
                    value="geometric"
                    v-model="antenna.rayTracingType"
                    @change="updateRayTracingMode(antenna)"
                />
                <span class="mode-text">📐 几何射线追踪</span>
                <small class="mode-desc">简单的几何线条显示</small>
              </label>

              <label class="raytracing-mode-option">
                <input
                    type="radio"
                    value="threejs"
                    v-model="antenna.rayTracingType"
                    @change="updateRayTracingMode(antenna)"
                />
                <span class="mode-text">🎯 3D立体射线追踪</span>
                <small class="mode-desc">Three.js风格的真实3D效果</small>
              </label>
            </div>
          </div>
          <!-- 📐 几何射线追踪配置 -->
          <div v-if="antenna.rayTracingType === 'geometric'" class="geometric-raytracing-section">
            <div class="geometric-header">
              <h5>📐 几何射线追踪配置</h5>
              <div class="geometric-toggle">
                <label class="toggle-switch">
                  <input
                      type="checkbox"
                      v-model="antenna.visualization.enabled"
                      @change="updateAntennaVisualization(antenna)"
                  />
                  <span class="toggle-slider"></span>
                  <span class="toggle-text">启用几何射线</span>
                </label>
              </div>
            </div>

            <div  class="geometric-controls">
              <!-- 波束角度控制 -->
              <div class="control-section">
                <h6>📐 波束角度设置</h6>
                <div class="control-grid">
                  <div class="control-item">
                    <label>
                      水平波束宽度：
                      <span class="value-display">{{ antenna.visualization.horizontalBeamWidth }}°</span>
                    </label>
                    <input
                        type="range"
                        v-model.number="antenna.visualization.horizontalBeamWidth"
                        @input="updateAntennaVisualization(antenna)"
                        min="10"
                        max="360"
                        step="10"
                        class="range-slider"
                    />
                  </div>

                  <div class="control-item">
                    <label>
                      垂直波束宽度：
                      <span class="value-display">{{ antenna.visualization.verticalBeamWidth }}°</span>
                    </label>
                    <input
                        type="range"
                        v-model.number="antenna.visualization.verticalBeamWidth"
                        @input="updateAntennaVisualization(antenna)"
                        min="5"
                        max="180"
                        step="5"
                        class="range-slider"
                    />
                  </div>
                </div>
              </div>

              <!-- 显示参数控制 -->
              <div class="control-section">
                <h6>🎨 显示参数</h6>
                <div class="control-grid">
                  <div class="control-item">
                    <label>
                      最大距离：
                      <span class="value-display">{{ antenna.visualization.maxDistance }}m</span>
                    </label>
                    <input
                        type="range"
                        v-model.number="antenna.visualization.maxDistance"
                        @input="updateAntennaVisualization(antenna)"
                        min="500"
                        max="20000"
                        step="500"
                        class="range-slider"
                    />
                  </div>

                  <div class="control-item">
                    <label>
                      透明度：
                      <span class="value-display">{{ Math.round(antenna.visualization.transparency * 100) }}%</span>
                    </label>
                    <input
                        type="range"
                        v-model.number="antenna.visualization.transparency"
                        @input="updateAntennaVisualization(antenna)"
                        min="0.1"
                        max="1"
                        step="0.1"
                        class="range-slider opacity-slider"
                    />
                  </div>
                </div>
              </div>

              <!-- 精度设置 -->
              <div class="control-section">
                <h6>⚙️ 精度设置</h6>
                <div class="precision-controls">
                  <div class="control-item">
                    <label>
                      精度等级：
                      <select
                          v-model="antenna.visualization.horizontalSteps"
                          @change="updateAntennaVisualization(antenna)"
                          class="precision-select"
                      >
                        <option :value="6">低精度 (6步)</option>
                        <option :value="12">中精度 (12步)</option>
                        <option :value="24">高精度 (24步)</option>
                        <option :value="36">超高精度 (36步)</option>
                      </select>
                    </label>
                  </div>

                  <div class="control-item">
                    <label class="checkbox-item">
                      <input
                          type="checkbox"
                          v-model="antenna.visualization.showContours"
                          @change="updateAntennaVisualization(antenna)"
                      />
                      <span class="checkbox-text">显示等值线</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 📡 Three.js风格3D射线追踪配置 - 新增 -->
          <div v-if="antenna.rayTracingType === 'threejs'" class="threejs-raytracing-section">
            <div class="threejs-header">
              <h5>🎯 3D立体射线追踪配置</h5>
              <div class="threejs-toggle">
                <label class="toggle-switch">
                  <input
                      type="checkbox"
                      v-model="antenna.threeJSRayTracing.enabled"
                      @change="updateThreeJSRayTracing(antenna)"
                  />
                  <span class="toggle-slider"></span>
                  <span class="toggle-text">启用3D射线追踪</span>
                </label>
              </div>
            </div>

            <div  class="threejs-controls">
              <!-- 波束角度控制 -->
              <div class="control-section">
                <h6>📐 波束角度设置</h6>
                <div class="control-grid">
                  <div class="control-item">
                    <label>
                      水平波束角度:
                      <span class="value-display">{{ antenna.threeJSRayTracing.azimuthAngle }}°</span>
                    </label>
                    <input
                        type="range"
                        v-model.number="antenna.threeJSRayTracing.azimuthAngle"
                        @input="updateThreeJSRayTracing(antenna)"
                        min="30"
                        max="180"
                        step="10"
                        class="range-slider azimuth-slider"
                    />
                  </div>

                  <div class="control-item">
                    <label>
                      垂直波束角度:
                      <span class="value-display">{{ antenna.threeJSRayTracing.elevationAngle }}°</span>
                    </label>
                    <input
                        type="range"
                        v-model.number="antenna.threeJSRayTracing.elevationAngle"
                        @input="updateThreeJSRayTracing(antenna)"
                        min="10"
                        max="90"
                        step="5"
                        class="range-slider elevation-slider"
                    />
                  </div>
                </div>
              </div>

              <!-- 计算参数控制 -->
              <div class="control-section">
                <h6>⚡ 计算参数</h6>
                <div class="control-grid">
                  <div class="control-item">
                    <label>
                      射线密度:
                      <span class="value-display">{{ getDensityLabel(antenna.threeJSRayTracing.density) }}</span>
                    </label>
                    <input
                        type="range"
                        v-model.number="antenna.threeJSRayTracing.density"
                        @input="updateThreeJSRayTracing(antenna)"
                        min="1"
                        max="5"
                        step="1"
                        class="range-slider density-slider"
                    />
                  </div>

                  <div class="control-item">
                    <label>
                      最大距离:
                      <span class="value-display">{{ antenna.threeJSRayTracing.maxRange }}m</span>
                    </label>
                    <input
                        type="range"
                        v-model.number="antenna.threeJSRayTracing.maxRange"
                        @input="updateThreeJSRayTracing(antenna)"
                        min="200"
                        max="1000"
                        step="50"
                        class="range-slider range-slider"
                    />
                  </div>
                </div>
              </div>

              <!-- 显示效果控制 -->
              <div class="control-section">
                <h6>🎨 显示效果</h6>
                <div class="effect-controls">
                  <div class="checkbox-group">
                    <label class="checkbox-item">
                      <input
                          type="checkbox"
                          v-model="antenna.threeJSRayTracing.showObstacles"
                          @change="updateThreeJSRayTracing(antenna)"
                      />
                      <span class="checkbox-text">🏢 显示建筑物遮挡</span>
                    </label>

                    <label class="checkbox-item">
                      <input
                          type="checkbox"
                          v-model="antenna.threeJSRayTracing.showRays"
                          @change="updateThreeJSRayTracing(antenna)"
                      />
                      <span class="checkbox-text">📡 显示射线轨迹</span>
                    </label>

                    <label class="checkbox-item">
                      <input
                          type="checkbox"
                          v-model="antenna.threeJSRayTracing.animateSignals"
                          @change="updateThreeJSRayTracing(antenna)"
                      />
                      <span class="checkbox-text">✨ 信号点脉动动画</span>
                    </label>
                  </div>

                  <div class="visual-controls">
                    <div class="control-item">
                      <label>
                        射线透明度:
                        <span class="value-display">{{ Math.round(antenna.threeJSRayTracing.rayOpacity * 100) }}%</span>
                      </label>
                      <input
                          type="range"
                          v-model.number="antenna.threeJSRayTracing.rayOpacity"
                          @input="updateThreeJSRayTracing(antenna)"
                          min="0.1"
                          max="1"
                          step="0.1"
                          class="range-slider opacity-slider"
                      />
                    </div>

                    <div class="control-item">
                      <label>
                        信号点大小:
                        <span class="value-display">{{ antenna.threeJSRayTracing.signalPointSize }}px</span>
                      </label>
                      <input
                          type="range"
                          v-model.number="antenna.threeJSRayTracing.signalPointSize"
                          @input="updateThreeJSRayTracing(antenna)"
                          min="4"
                          max="16"
                          step="1"
                          class="range-slider size-slider"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <!-- 信号强度图例 -->
              <div class="signal-legend">
                <h6>📊 信号强度图例</h6>
                <div class="legend-items">
                  <div class="legend-item">
                    <div class="legend-color" style="background: #32ff32;"></div>
                    <span>强信号 (&gt; -60dBm)</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-color" style="background: #adff2f;"></div>
                    <span>良好 (-60 ~ -70dBm)</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-color" style="background: #ffff00;"></div>
                    <span>中等 (-70 ~ -80dBm)</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-color" style="background: #ffa500;"></div>
                    <span>弱信号 (-80 ~ -100dBm)</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-color" style="background: #ff0000;"></div>
                    <span>很弱 (&lt; -100dBm)</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-color" style="background: #808080;"></div>
                    <span>阴影/遮挡区域</span>
                  </div>
                </div>
              </div>

              <!-- 性能提示 -->
              <div class="performance-warning" v-if="antenna.threeJSRayTracing.density > 3">
                <div class="warning-icon">⚠️</div>
                <div class="warning-text">
                  <strong>性能提示：</strong><br>
                  高密度设置可能影响渲染性能，建议在低端设备上使用中等密度。
                </div>
              </div>
            </div>
          </div>
        </div>

        <button @click="addAntenna" class="btn-add">➕ 添加天线</button>
      </div>

      <!-- 基站操作按钮 -->
      <div class="station-actions">
        <button @click="deleteStation" class="btn-delete">🗑️ 删除基站</button>
        <button @click="flyToStation" class="btn-fly">📍 定位到基站</button>
      </div>
    </div>

    <!-- 未选中时的提示 -->
<!--    <div v-else class="no-selection">-->
<!--      <h4>基站管理系统</h4>-->
<!--      <p>🎯 在地图上点击添加基站</p>-->
<!--      <p>📋 从左侧列表选择基站进行编辑</p>-->
<!--      <p>📡 配置天线参数和覆盖范围</p>-->
<!--    </div>-->
  </div>
</template>

<script setup lang="ts">
import { computed ,ref} from 'vue'
import { useBaseStationStore } from '../stores/baseStations'
import { nanoid } from 'nanoid'
import type { Antenna } from '../types'
import { PROPAGATION_MODELS, getPropagationModel } from '../utils/propagationModels'
import * as Cesium from "cesium";
const store = useBaseStationStore()
const selected = computed(() => store.selectedStation)

const showDetails = ref(false) // 是否显示详情


// 新增：更新射线追踪模式
function updateRayTracingMode(antenna: Antenna) {
  // 切换模式时，先禁用其他模式
  // 切换模式时，先禁用所有模式的渲染
  antenna.visualization.enabled = false
  antenna.threeJSRayTracing.enabled = false
  // 通知地图组件更新射线追踪模式
  window.dispatchEvent(new CustomEvent('updateRayTracingMode', {
    detail: {
      stationId: selected.value?.id,
      antennaId: antenna.id,
      antenna: antenna
    }
  }))
}

// 新增：更新Three.js射线追踪配置
function updateThreeJSRayTracing(antenna: Antenna) {

  window.dispatchEvent(new CustomEvent('updateAntennaVisualization', {
    detail: {
      stationId: selected.value?.id,
      antennaId: antenna.id,
      antenna: antenna
    }
  }))
}

// 新增：获取密度标签
function getDensityLabel(density: number): string {
  const labels = ['很低', '低', '中等', '高', '很高']
  return labels[density - 1] || '中等'
}

// 更新天线可视化
function updateAntennaVisualization(antenna: Antenna) {
  // 触发可视化更新事件
  window. dispatchEvent(new CustomEvent('updateAntennaVisualization', {
    detail: {
      stationId: selected.value?.id,
      antennaId: antenna.id,
      antenna: antenna
    }
  }))
}
// 修改添加天线函数，设置默认传播模型
function addAntenna() {
  if (!selected.value) return

  const defaultModel = getPropagationModel('free-space')!

  const newAntenna: Antenna = {
    id: nanoid(),
    type: '单天线',
    azimuth: 0,
    elevation: 0,
    height: 5,
    power: 20,
    gain: 15,
    frequency: 1800, // 默认1800MHz
    propagationModel: { ...defaultModel },
    visualization: {  // 新增默认可视化配置
      enabled: false,
      horizontalBeamWidth:40,
      verticalBeamWidth: 30,
      horizontalSteps: 12,
      verticalSteps: 30,
      maxDistance: 1000,
      transparency: 0.6,
      showContours: false,

    },
    threeJSRayTracing: {  // 新增默认Three.js射线追踪配置
      enabled: false,
      azimuthAngle: 120,
      elevationAngle: 30,
      density: 3,
      maxRange: 500,
      showObstacles: true,
      showRays: true,
      animateSignals: true,
      rayOpacity: 0.4,
      signalPointSize: 4
    },
    rayTracingType: 'geometric'
  }

  store.addAntennaToStation(selected.value.id, newAntenna)
}


function removeAntenna(antennaId: string) {
  if (!selected.value) return

  if (confirm('确定要删除这个天线吗？')) {
    //清理可视化

    store.removeAntennaFromStation(selected.value.id, antennaId)
  }
}

// 更新基站信息到store
function updateStation() {
  if (!selected.value) return

  store.updateStation(selected.value.id, {
    name: selected.value.name,
    height: selected.value.height
  })
}

function setHeight(height: number) {
  if (!selected.value) return

  selected.value.height = height
  updateStation()
}

function deleteStation() {
  if (!selected.value) return

  if (confirm(`确定要删除基站 "${selected.value.name}" 吗？`)) {
    store.removeStation(selected.value.id)
  }
}
// 切换创建模式
function toggleCreateMode() {
  store.toggleCreatingMode()
}

// 清空所有基站
function clearAllStations() {
  if (store.totalStations === 0) return

  if (confirm(`确定要删除所有 ${store.totalStations} 个基站吗？此操作不可恢复！`)) {
    store.clearAllStations()
    showDetails.value = false
  }
}
// 通过事件通知地图组件飞行到基站
function flyToStation() {
  if (!selected.value) return

  window.dispatchEvent(new CustomEvent('flyToStation', {
    detail: {
      longitude: selected.value.longitude,
      latitude: selected.value.latitude,
      height: selected.value.height,
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-30),
        roll: 0.0
      }
    }
  }))

}
// 隐藏详情面板
function hideDetails() {
  showDetails.value = false
}

// 修改选择基站函数，添加动画延迟
function selectAndShowDetails(id: string) {
  store.selectStation(id)

  // 如果当前已显示详情，先隐藏再显示新的
  if (showDetails.value) {
    showDetails.value = false
    setTimeout(() => {
      showDetails.value = true
    }, 200) // 等待隐藏动画完成
  } else {
    showDetails.value = true
  }
}
// 更新基站位置（包含经纬度变化）
function updateStationPosition() {
  if (!selected.value) return

  store.updateStation(selected.value.id, {
    longitude: selected.value.longitude,
    latitude: selected.value.latitude
  })

  // 通知地图组件更新基站位置
  window.dispatchEvent(new CustomEvent('updateStationPosition', {
    detail: {
      stationId: selected.value.id,
      longitude: selected.value.longitude,
      latitude: selected.value.latitude,
      height: selected.value.height
    }
  }))

}

function updatePropagationModel(antenna: Antenna) {
  // 更新传播模型
  const model = getPropagationModel(antenna.propagationModel.type)
  if (model) {
    antenna.propagationModel = { ...model }
  }

}
// 获取模型描述
function getModelDescription(type: string): string {
  const model = getPropagationModel(type)
  return model?.description || ''
}

</script>

<style scoped>


/* 修改：面板样式 */
.panel {
  position: absolute;
  top: 0;
  left: 0;
  height: 100vh;
  z-index: 1000;
  transition: all 0.3s;
}



.details {
  width: 380px;
  padding: 15px;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(5px);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  height: 100vh;
  border-right: 1px solid #ccc;
}


.panel {
  display: flex;
  height: 100vh;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  border-right: 1px solid #ccc;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(5px);
}

.list {
  width: 200px;
  border-right: 1px solid #ddd;
  padding: 15px;
  overflow-y: auto;
  background: skyblue;
}

.list h3 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 16px;
}

.list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.list li {
  padding: 10px 12px;
  margin-bottom: 6px;
  cursor: pointer;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.2s;
  background: white;
}

.list li:hover {
  background: #f5f5f5;
  transform: translateX(2px);
}

.list li.active {
  background: #e3f2fd;
  border-color: #2196f3;
  box-shadow: 0 2px 4px rgba(33, 150, 243, 0.2);
}

.list li span {
  display: block;
  font-weight: 500;
  color: #333;
}

.list small {
  display: block;
  color: #666;
  font-size: 11px;
  margin-top: 2px;
}

.stats {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #eee;
  font-size: 12px;
  color: #666;
}

.details {
  width: 380px;
  padding: 15px;
  overflow-y: auto;
}



.no-selection h4 {
  color: #333;
  margin-bottom: 20px;
}

.no-selection p {
  margin: 8px 0;
  font-size: 14px;
}

.info-group {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.info-group label {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
  color: #555;
}

.info-group input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-top: 4px;
  font-size: 13px;
}

.height-input-group {
  display: flex;
  align-items: center;
  margin-top: 4px;
}

.height-input-group input {
  flex: 1;
  margin-top: 0;
  margin-right: 8px;
}

.height-input-group .unit {
  color: #666;
  font-size: 12px;
}


.height-presets {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.preset-label {
  font-size: 12px;
  color: #666;
  margin-right: 4px;
}

.preset-btn {
  padding: 4px 8px;
  font-size: 11px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-btn:hover {
  background: #e0e0e0;
}

.antenna-section h4 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 15px;
}

.antenna-item {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 15px;
  background: #fafafa;
}

.antenna-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.antenna-header h5 {
  margin: 0;
  color: #555;
  font-size: 13px;
}

.antenna-height {
  font-weight: normal;
  color: #888;
  font-size: 11px;
}

.antenna-controls {
  display: grid;
  gap: 10px;
}

.antenna-controls label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin: 0;
}

.antenna-controls input,
.antenna-controls select {
  width: 90px;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 12px;
}

.btn-add {
  width: 100%;
  padding: 10px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.btn-add:hover {
  background: #45a049;
}

.btn-remove {
  background: #f44336;
  color: white;
  border: none;
  border-radius: 3px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.btn-remove:hover {
  background: #da190b;
}

.station-actions {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #eee;
  display: flex;
  gap: 10px;
}

.btn-delete {
  flex: 1;
  padding: 8px 12px;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-delete:hover {
  background: #da190b;
}

.btn-fly {
  flex: 1;
  padding: 8px 12px;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-fly:hover {
  background: #1976d2;
}
.coordinate-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}

.coordinate-info label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #555;
}

.coordinate-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 12px;
  font-family: 'Courier New', monospace; /* 等宽字体便于阅读数字 */
}

.coordinate-input:focus {
  border-color: #2196f3;
  outline: none;
  box-shadow: 0 0 3px rgba(33, 150, 243, 0.3);
}

.unit {
  color: #666;
  font-size: 12px;
  min-width: 15px;
}


/* 详情面板头部 */
.details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e3f2fd;
  background: linear-gradient(135deg, #f5f5f5 0%, #e8f4fd 100%);
  margin: -15px -15px 20px -15px;
  padding: 15px 15px 12px 15px;
}

.details-header h3 {
  margin: 0;
  color: #1976d2;
  font-size: 16px;
  font-weight: 600;
}

.btn-collapse {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-weight: bold;
}

.btn-collapse:hover {
  background: rgba(244, 67, 54, 0.2);
  transform: scale(1.1);
}

/* 优化详情面板样式 */
.details {
  width: 380px;
  padding: 15px;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(8px);
  box-shadow: -4px 0 15px rgba(0, 0, 0, 0.15);
  height: 100vh;
  border-left: 1px solid #e0e0e0;
  position: relative;
}

/* 让基站列表项点击时有更好的反馈 */
.list li {
  padding: 12px 14px;
  margin-bottom: 6px;
  cursor: pointer;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  background: white;
  position: relative;
  overflow: hidden;
}

.list li::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(33, 150, 243, 0.1), transparent);
  transition: left 0.5s;
}

.list li:hover::before {
  left: 100%;
}

.list li:hover {
  background: #f8f9fa;
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.list li.active {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  border-color: #2196f3;
  box-shadow: 0 3px 12px rgba(33, 150, 243, 0.3);
  transform: translateX(6px);
}

.list li.active::after {
  content: '▶';
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #2196f3;
  font-size: 12px;
}
.propagation-model-section {
  margin-top: 15px;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
}

.model-label {
  font-weight: 600;
  color: #1976d2;
}

.model-select {
  width: 100%;
  margin-top: 4px;
  padding: 6px 8px;
  border: 2px solid #e3f2fd;
  border-radius: 4px;
  background: white;
  font-size: 12px;
}

.model-select:focus {
  border-color: #2196f3;
  outline: none;
}

.model-description {
  margin-top: 8px;
  padding: 8px 10px;
  background: #f8f9ff;
  border-left: 3px solid #2196f3;
  border-radius: 0 4px 4px 0;
}

.model-description small {
  color: #555;
  line-height: 1.4;
  font-size: 11px;
}

.model-parameters {
  margin-top: 10px;
  padding: 8px;
  background: #fafafa;
  border-radius: 4px;
}

.param-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-group label {
  font-size: 11px;
  color: #666;
}

.param-group input,
.param-group select {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 11px;
}


.visualization-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.toggle-text {
  font-size: 13px;
}


.control-group label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #555;
}

.control-group input[type="number"],
.control-group input[type="range"] {
  width: 80px;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 11px;
}

.control-group input[type="range"] {
  width: 60px;
}

.value-display {
  color: #666;
  font-size: 10px;
  min-width: 30px;
  text-align: right;
}

.precision-select {
  width: 120px;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 11px;
}


.contour-toggle input[type="checkbox"] {
  width: 14px;
  height: 14px;
}



/* 射线追踪模式选择样式 */
.raytracing-mode-section {
  margin-top: 15px;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
}

.raytracing-mode-header h5 {
  margin: 0 0 12px 0;
  color: #1976d2;
  font-size: 14px;
  font-weight: 600;
}

.raytracing-mode-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.raytracing-mode-option {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  background: white;
}

.raytracing-mode-option:hover {
  border-color: #2196f3;
  background: #f8f9ff;
}

.raytracing-mode-option input[type="radio"]:checked + .mode-text {
  color: #1976d2;
  font-weight: 600;
}

.raytracing-mode-option input[type="radio"] {
  display: none;
}

.raytracing-mode-option input[type="radio"]:checked ~ .mode-desc {
  color: #1976d2;
}

.raytracing-mode-option:has(input[type="radio"]:checked) {
  border-color: #2196f3;
  background: #e3f2fd;
}

.mode-text {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
}

.mode-desc {
  font-size: 11px;
  color: #666;
}

/* Three.js射线追踪配置样式 */
.threejs-raytracing-section {
  margin-top: 15px;
  background: linear-gradient(135deg, #f8f9ff 0%, #e8f4fd 100%);
  border: 1px solid #2196f3;
  border-radius: 12px;
  padding: 15px;
}

.threejs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.threejs-header h5 {
  margin: 0;
  color: #1976d2;
  font-size: 14px;
  font-weight: 600;
}

.toggle-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #555;
  cursor: pointer;
}

.toggle-slider {
  position: relative;
  width: 40px;
  height: 20px;
  background: #ccc;
  border-radius: 20px;
  transition: all 0.3s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: all 0.3s;
}

.toggle-switch input[type="checkbox"]:checked + .toggle-slider {
  background: #2196f3;
}

.toggle-switch input[type="checkbox"]:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.toggle-switch input[type="checkbox"] {
  display: none;
}

.threejs-controls {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.control-section {
  background: rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  padding: 12px;
}

.control-section h6 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 12px;
  font-weight: 600;
}

.control-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-item label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #555;
  font-weight: 500;
}

.value-display {
  color: #1976d2;
  font-weight: 600;
  background: rgba(33, 150, 243, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  min-width: 40px;
  text-align: center;
}

.range-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
  background: linear-gradient(to right, #e0e0e0 0%, #2196f3 0%, #2196f3 50%, #e0e0e0 50%);
}

.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #2196f3;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.range-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #2196f3;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.azimuth-slider {
  background: linear-gradient(to right, #ff9800, #2196f3, #ff9800);
}

.elevation-slider {
  background: linear-gradient(to right, #4caf50, #2196f3, #4caf50);
}

.density-slider {
  background: linear-gradient(to right, #e0e0e0, #ff5722);
}

.opacity-slider {
  background: linear-gradient(to right, rgba(33, 150, 243, 0.1), rgba(33, 150, 243, 1));
}

.effect-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 11px;
  color: #555;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.checkbox-item:hover {
  background: rgba(33, 150, 243, 0.1);
}

.checkbox-item input[type="checkbox"] {
  width: 14px;
  height: 14px;
  margin: 0;
}

.checkbox-text {
  font-weight: 500;
}

.visual-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid #e0e0e0;
}

/* 信号强度图例样式 */
.signal-legend {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  padding: 10px;
}

.signal-legend h6 {
  margin: 0 0 8px 0;
  color: #333;
  font-size: 11px;
  font-weight: 600;
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #555;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.5);
}

/* 性能警告样式 */
.performance-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid #ffc107;
  border-radius: 6px;
  padding: 8px;
}

.warning-icon {
  font-size: 16px;
  line-height: 1;
}

.warning-text {
  font-size: 10px;
  color: #e65100;
  line-height: 1.3;
}

.warning-text strong {
  color: #d84315;
}
</style>