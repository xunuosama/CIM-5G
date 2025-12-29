<template>
  <div id="app">
    <!-- 左侧面板切换按钮 -->
    <div class="panel-toggle-buttons">
      <div
          class="toggle-btn station-toggle"
          @click="toggleStationPanel"
          :class="{ active: currentPanel === 'station' }"
          title="基站管理"
      >
        📡
      </div>
      <div
          class="toggle-btn building-toggle"
          @click="toggleBuildingPanel"
          :class="{ active: currentPanel === 'building' }"
          title="楼体管理"
      >
        🏢
      </div>
    </div>

    <!-- 基站管理面板 -->
    <BaseStationPanel v-if="currentPanel === 'station'" />

    <!-- 楼体管理面板 -->
    <BuildingPanel v-if="currentPanel === 'building'" />

    <!-- 3D地图视图 -->
    <CesiumViewer />

    <!-- 模式指示器 -->
    <div class="mode-indicator" v-if="store.isCreatingMode || buildingStore.isCreatingBuilding">
      <div class="indicator-content">
        <span v-if="store.isCreatingMode" class="mode-text station-mode">
          📡 基站创建模式 - 点击地图添加基站
        </span>
        <span v-if="buildingStore.isCreatingBuilding" class="mode-text building-mode">
          🏢 楼体创建模式 - 点击地图添加楼体
        </span>
        <button
            @click="exitCreationMode"
            class="exit-mode-btn"
            title="退出创建模式"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- 状态栏 -->
    <div class="status-bar">
      <div class="status-item">
        <span class="status-label">基站:</span>
        <span class="status-value">{{ store.totalStations }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">天线:</span>
        <span class="status-value">{{ store.totalAntennas }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">楼体:</span>
        <span class="status-value">{{ buildingStore.totalBuildings }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">射线追踪:</span>
        <span class="status-value">
          几何: {{ store.activeRayTracingAntennas.geometric }} | 
          3D: {{ store.activeRayTracingAntennas.threejs }}
        </span>
      </div>
    </div>

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
  </div>
</template>

<script setup>
import {onMounted, ref} from 'vue'
import { useBaseStationStore } from './stores/baseStations'
import { useBuildingStore } from './stores/buildings'
import CesiumViewer from './components/CesiumViewer.vue'
import BaseStationPanel from './components/BaseStationPanel.vue'
import BuildingPanel from './components/BuildingPanel.vue'
import { TilesLoader } from './utils/3dTilesLoader'
const store = useBaseStationStore()
const buildingStore = useBuildingStore()

// 当前激活的面板：'station' 或 'building'
const currentPanel = ref('station')

// 切换到基站面板
function toggleStationPanel() {
  currentPanel.value = currentPanel.value === 'station' ? null : 'station'
}

// 切换到楼体面板
function toggleBuildingPanel() {
  currentPanel.value = currentPanel.value === 'building' ? null : 'building'
}

// 退出创建模式
function exitCreationMode() {
  store.setCreatingMode(false)
  buildingStore.setBuildingCreationMode(false)
}


</script>

<style scoped>
#app {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  margin: 0;
  padding: 0;
  height: 100vh;
  position: relative;
  background: #f0f2f5;
}

/* 面板切换按钮组 */
.panel-toggle-buttons {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1001;
  display: flex;
  flex-direction: column;
}

.toggle-btn {
  width: 50px;
  height: 50px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ccc;
  border-left: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 20px;
  transition: all 0.3s ease;
  backdrop-filter: blur(5px);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
}

.toggle-btn:first-child {
  border-radius: 0 8px 0 0;
  border-bottom: none;
}

.toggle-btn:last-child {
  border-radius: 0 0 8px 0;
}

.toggle-btn:hover {
  background: rgba(33, 150, 243, 0.1);
  transform: translateX(5px);
}

.toggle-btn.active {
  background: #2196f3;
  color: white;
  transform: translateX(8px);
  box-shadow: 3px 0 12px rgba(33, 150, 243, 0.3);
}

.station-toggle.active {
  background: #4CAF50;
  box-shadow: 3px 0 12px rgba(76, 175, 80, 0.3);
}

.building-toggle.active {
  background: #FF9800;
  box-shadow: 3px 0 12px rgba(255, 152, 0, 0.3);
}

/* 模式指示器 */
.mode-indicator {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  pointer-events: none;
}

.indicator-content {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 12px 20px;
  border-radius: 25px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  pointer-events: auto;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.mode-text {
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.station-mode {
  color: #4CAF50;
}

.building-mode {
  color: #FF9800;
}

.exit-mode-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.exit-mode-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

/* 状态栏 */
.status-bar {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 16px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 8px 20px;
  border-radius: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1500;
  font-size: 12px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-label {
  color: #666;
  font-weight: 500;
}

.status-value {
  color: #2c3e50;
  font-weight: 600;
  background: #f0f7ff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .status-bar {
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px;
  }

  .mode-indicator .indicator-content {
    flex-direction: column;
    gap: 8px;
    padding: 16px;
  }
}

.signal-legend {
  position: absolute;
  bottom: 0px;
  right: 0px;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.5); /* 白色背景 + 半透明 */
  padding: 5px;
  border-radius: 5px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

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

</style>