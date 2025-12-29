<template>
  <div class="panel">
    <!-- 楼体列表 -->
    <div class="list">
      <h3>楼体列表 ({{ buildingStore.totalBuildings }})</h3>

      <!-- 导入楼体按钮 -->
      <div class="import-section">
        <button
            @click="importTilesBuildings"
            :disabled="buildingStore.isImporting"
            class="btn-import"
        >
          {{ buildingStore.isImporting ? '📁 导入中...' : '📁 导入3D Tiles楼体' }}
        </button>

        <!-- 导入进度显示 -->
        <div v-if="buildingStore.isImporting" class="import-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: importProgress + '%' }"></div>
          </div>
          <small>正在导入楼体数据...</small>
        </div>

        <!-- 导入结果显示 -->
        <div v-if="showImportResult && buildingStore.lastImportResult" class="import-result">
          <div :class="['result-message', buildingStore.lastImportResult.success ? 'success' : 'error']">
            {{ getImportResultMessage() }}
          </div>
        </div>
      </div>

      <!-- 分类楼体列表 -->
      <div class="building-categories">
        <!-- 自建楼体分类 -->
        <div class="category-section">
          <div
              class="category-header"
              @click="toggleManualBuildings"
              :class="{ expanded: showManualBuildings }"
          >
            <span class="category-icon">{{ showManualBuildings ? '▼' : '▶' }}</span>
            <span class="category-title">📝 自建楼体 ({{ buildingStore.manualBuildingsCount }})</span>
          </div>

          <div v-if="showManualBuildings" class="category-content">
            <ul v-if="buildingStore.manualBuildingsCount > 0">
              <li
                  v-for="building in buildingStore.manualBuildings"
                  :key="building.id"
                  @click="selectAndShowDetails(building.id)"
                  :class="{ active: building.id === buildingStore.selectedBuildingId }"
                  class="building-item manual-building"
              >
                <span>{{ building.name }}</span>
                <small>{{ building.width }}×{{ building.length }}×{{ building.height }}m ({{ building.floors }}层)</small>
              </li>
            </ul>
            <div v-else class="empty-category">
              <small>暂无自建楼体</small>
            </div>
          </div>
        </div>

        <!-- 导入楼体分类 -->
        <div class="category-section">
          <div
              class="category-header"
              @click="toggleImportedBuildings"
              :class="{ expanded: showImportedBuildings }"
          >
            <span class="category-icon">{{ showImportedBuildings ? '▼' : '▶' }}</span>
            <span class="category-title">📦 导入楼体 ({{ buildingStore.importedBuildingsCount }})</span>
          </div>

          <div v-if="showImportedBuildings" class="category-content">
            <ul v-if="buildingStore.importedBuildingsCount > 0">
              <li
                  v-for="building in buildingStore.importedBuildings"
                  :key="building.id"
                  @click="selectAndShowDetails(building.id)"
                  :class="{ active: building.id === buildingStore.selectedBuildingId }"
                  class="building-item imported-building"
              >
                <span>{{ building.name }}</span>
                <small>{{ building.width }}×{{ building.length }}×{{ building.height }}m ({{ building.floors }}层)</small>
                <div class="imported-badge">3D Tiles</div>
              </li>
            </ul>
            <div v-else class="empty-category">
              <small>暂无导入楼体</small>
            </div>
          </div>
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="stats" v-if="buildingStore.totalBuildings > 0">
        <p>自建楼体：{{ buildingStore.manualBuildingsCount }}</p>
        <p>导入楼体：{{ buildingStore.importedBuildingsCount }}</p>
        <p>总体积：{{ Math.round(buildingStore.totalBuildingVolume / 1000) }}k m³</p>
        <p>平均墙损：{{ buildingStore.averageWallLoss }}dB</p>
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <button
            @click="toggleBuildingCreation"
            :class="{ active: buildingStore.isCreatingBuilding }"
            class="btn-create"
        >
          {{ buildingStore.isCreatingBuilding ? '🚫 取消创建' : '🏢 创建楼体' }}
        </button>

        <button
            @click="clearAllBuildings"
            class="btn-clear"
            :disabled="buildingStore.totalBuildings === 0"
        >
          🗑️ 清空所有
        </button>
      </div>
    </div>

    <!-- 楼体详情面板 -->
    <div class="details" v-if="selectedBuilding && showDetails">
      <!-- 详情面板顶部工具栏 -->
      <div class="details-header">
        <h3>{{ selectedBuilding.name }}</h3>
        <button @click="hideDetails" class="btn-collapse" title="收起详情">
          ✕
        </button>
      </div>

      <h3>楼体信息</h3>

      <!-- 基本信息编辑 -->
      <div class="info-group">
        <label>
          名称：
          <input
              v-model="selectedBuilding.name"
              @input="updateBuilding"
              placeholder="请输入楼体名称"
          />
        </label>

        <!-- 坐标信息 -->
        <div class="coordinate-info">
          <label>
            经度：
            <input
                type="number"
                v-model.number="selectedBuilding.longitude"
                @input="updateBuildingPosition"
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
                v-model.number="selectedBuilding.latitude"
                @input="updateBuildingPosition"
                min="-90"
                max="90"
                step="0.000001"
                placeholder="纬度坐标"
                class="coordinate-input"
            />
            <span class="unit">°</span>
          </label>
        </div>
      </div>

      <!-- 几何参数配置 -->
      <div class="geometry-section">
        <h4>🔷 几何参数</h4>

        <div class="geometry-controls">
          <label>
            长度：
            <div class="height-input-group">
              <input
                  type="number"
                  v-model.number="selectedBuilding.length"
                  @input="updateBuilding"
                  min="1"
                  max="500"
                  step="1"
                  placeholder="楼体长度"
              />
              <span class="unit">米</span>
            </div>
          </label>

          <label>
            宽度：
            <div class="height-input-group">
              <input
                  type="number"
                  v-model.number="selectedBuilding.width"
                  @input="updateBuilding"
                  min="1"
                  max="500"
                  step="1"
                  placeholder="楼体宽度"
              />
              <span class="unit">米</span>
            </div>
          </label>

          <label>
            高度：
            <div class="height-input-group">
              <input
                  type="number"
                  v-model.number="selectedBuilding.height"
                  @input="updateBuilding"
                  min="1"
                  max="300"
                  step="1"
                  placeholder="楼体高度"
              />
              <span class="unit">米</span>
            </div>
          </label>

          <label>
            楼层数：
            <div class="height-input-group">
              <input
                  type="number"
                  v-model.number="selectedBuilding.floors"
                  @input="updateBuilding"
                  min="1"
                  max="100"
                  step="1"
                  placeholder="楼层数"
              />
              <span class="unit">层</span>
            </div>
          </label>

          <label>
            旋转角度：
            <div class="height-input-group">
              <input
                  type="number"
                  v-model.number="selectedBuilding.rotation"
                  @input="updateBuilding"
                  min="0"
                  max="360"
                  step="5"
                  placeholder="旋转角度"
              />
              <span class="unit">°</span>
            </div>
          </label>
        </div>

        <!-- 快速尺寸预设 -->
        <div class="height-presets">
          <span class="preset-label">快速预设：</span>
          <button @click="setSize(20, 20, 60, 20)" class="preset-btn">住宅楼</button>
          <button @click="setSize(50, 30, 80, 25)" class="preset-btn">办公楼</button>
          <button @click="setSize(100, 80, 120, 30)" class="preset-btn">商业楼</button>
        </div>
      </div>

      <!-- 材料与信号参数 -->
      <div class="material-section">
        <h4>🧱 材料与信号参数</h4>

        <label>
          建筑材料：
          <select
              v-model="selectedBuilding.materialType"
              @change="updateBuildingMaterial"
              class="model-select"
          >
            <option v-for="material in materials" :key="material.type" :value="material.type">
              {{ material.name }}
            </option>
          </select>
        </label>

        <!-- 材料描述 -->
        <div class="model-description">
          <small>{{ getMaterialDescription(selectedBuilding.materialType) }}</small>
        </div>

        <div class="signal-parameters">
          <label>
            墙体损耗：
            <input
                type="number"
                v-model.number="selectedBuilding.wallLoss"
                @input="updateBuilding"
                min="0"
                max="50"
                step="0.5"
            />dB
          </label>

          <label>
            屋顶损耗：
            <input
                type="number"
                v-model.number="selectedBuilding.roofLoss"
                @input="updateBuilding"
                min="0"
                max="50"
                step="0.5"
            />dB
          </label>

          <label>
            楼层损耗：
            <input
                type="number"
                v-model.number="selectedBuilding.floorLoss"
                @input="updateBuilding"
                min="0"
                max="20"
                step="0.1"
            />dB/层
          </label>
        </div>
      </div>

      <!-- 外观设置 -->
      <div class="appearance-section">
        <h4>🎨 外观设置</h4>

        <label>
          楼体颜色：
          <input
              type="color"
              v-model="selectedBuilding.color"
              @input="updateBuilding"
              class="color-input"
          />
        </label>

        <label>
          透明度：
          <span class="value-display">{{ Math.round(selectedBuilding.opacity * 100) }}%</span>
        </label>
        <input
            type="range"
            v-model.number="selectedBuilding.opacity"
            @input="updateBuilding"
            min="0.1"
            max="1"
            step="0.1"
            class="range-slider opacity-slider"
        />
      </div>

      <!-- 楼体操作按钮 -->
      <div class="station-actions">
        <button @click="deleteBuilding" class="btn-delete">🗑️ 删除楼体</button>
        <button @click="flyToBuilding" class="btn-fly">📍 定位到楼体</button>
        <button @click="duplicateBuilding" class="btn-duplicate">📋 复制楼体</button>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBuildingStore } from '../stores/buildings'
import { getAllBuildingMaterials, getBuildingMaterial } from '../utils/buildingMaterials'
import { nanoid } from 'nanoid'
import * as Cesium from 'cesium'
import type { Building, BuildingMaterialType } from '../types'

const buildingStore = useBuildingStore()
const materials = getAllBuildingMaterials()
// 新增响应式数据
const showManualBuildings = ref(true)      // 默认展开自建楼体
const showImportedBuildings = ref(false)   // 默认折叠导入楼体
const showImportResult = ref(false)        // 是否显示导入结果
const importProgress = ref(0)              // 导入进度

const selectedBuilding = computed(() => buildingStore.selectedBuilding)
const showDetails = ref(false)

// 获取材料描述
function getMaterialDescription(type: BuildingMaterialType): string {
  const material = getBuildingMaterial(type)
  return material ? `墙体损耗: ${material.wallLoss}dB, 楼层损耗: ${material.floorLoss}dB/层` : ''
}

// 选择并显示楼体详情
function selectAndShowDetails(id: string) {
  buildingStore.selectBuilding(id)

  if (showDetails.value) {
    showDetails.value = false
    setTimeout(() => {
      showDetails.value = true
    }, 200)
  } else {
    showDetails.value = true
  }
}

// 隐藏详情面板
function hideDetails() {
  showDetails.value = false
}

// 切换楼体创建模式
function toggleBuildingCreation() {
  buildingStore.toggleBuildingCreationMode()
}

// 清空所有楼体
function clearAllBuildings() {
  if (buildingStore.totalBuildings === 0) return

  if (confirm(`确定要删除所有 ${buildingStore.totalBuildings} 个楼体吗？此操作不可恢复！`)) {
    buildingStore.clearAllBuildings()
    showDetails.value = false
  }
}

// 更新楼体信息
function updateBuilding() {
  if (!selectedBuilding.value) return

  buildingStore.updateBuilding(selectedBuilding.value.id, {
    name: selectedBuilding.value.name,
    width: selectedBuilding.value.width,
    length: selectedBuilding.value.length,
    height: selectedBuilding.value.height,
    floors: selectedBuilding.value.floors,
    rotation: selectedBuilding.value.rotation,
    wallLoss: selectedBuilding.value.wallLoss,
    roofLoss: selectedBuilding.value.roofLoss,
    floorLoss: selectedBuilding.value.floorLoss,
    color: selectedBuilding.value.color,
    opacity: selectedBuilding.value.opacity
  })
}

// 更新楼体位置
function updateBuildingPosition() {
  if (!selectedBuilding.value) return

  buildingStore.updateBuilding(selectedBuilding.value.id, {
    longitude: selectedBuilding.value.longitude,
    latitude: selectedBuilding.value.latitude
  })
}

// 更新楼体材料
function updateBuildingMaterial() {
  if (!selectedBuilding.value) return

  buildingStore.updateBuildingMaterial(
      selectedBuilding.value.id,
      selectedBuilding.value.materialType
  )
}

// 设置预设尺寸
function setSize(length: number, width: number, height: number, floors: number) {
  if (!selectedBuilding.value) return

  selectedBuilding.value.length = length
  selectedBuilding.value.width = width
  selectedBuilding.value.height = height
  selectedBuilding.value.floors = floors
  updateBuilding()
}

// 删除楼体
function deleteBuilding() {
  if (!selectedBuilding.value) return

  if (confirm(`确定要删除楼体 "${selectedBuilding.value.name}" 吗？`)) {
    buildingStore.removeBuilding(selectedBuilding.value.id)
    showDetails.value = false
  }
}

// 飞行到楼体
function flyToBuilding() {
  if (!selectedBuilding.value) return

  window.dispatchEvent(new CustomEvent('flyToBuilding', {
    detail: {
      longitude: selectedBuilding.value.longitude,
      latitude: selectedBuilding.value.latitude,
      height: selectedBuilding.value.height,
      orientation: {
        heading: Cesium.Math.toRadians(45),
        pitch: Cesium.Math.toRadians(-30),
        roll: 0.0
      }
    }
  }))
}

// 复制楼体
function duplicateBuilding() {
  if (!selectedBuilding.value) return

  const newBuilding: Building = {
    ...selectedBuilding.value,
    id: nanoid(),
    name: `${selectedBuilding.value.name} - 副本`,
    longitude: selectedBuilding.value.longitude + 0.001,
    latitude: selectedBuilding.value.latitude + 0.001
  }

  buildingStore.addBuilding(newBuilding)

  window.dispatchEvent(new CustomEvent('addBuildingToMap', {
    detail: { building: newBuilding }
  }))
}


// 切换自建楼体显示
function toggleManualBuildings() {
  showManualBuildings.value = !showManualBuildings.value
}

//切换导入楼体显示
function toggleImportedBuildings() {
  showImportedBuildings.value = !showImportedBuildings.value
}

// 导入3D Tiles楼体
async function importTilesBuildings() {
  try {
    showImportResult.value = false

    const result = await buildingStore.importTilesBuildings()

    // 显示导入结果
    showImportResult.value = true

    // 如果成功导入，展开导入楼体分类
    if (result.success && result.importedCount > 0) {
      showImportedBuildings.value = true
    }

    // 3秒后隐藏结果消息
    setTimeout(() => {
      showImportResult.value = false
      buildingStore.clearImportStatus()
    }, 3000)

  } catch (error) {
    console.error('导入楼体失败:', error)
    showImportResult.value = true
  }
}

// 获取导入结果消息
function getImportResultMessage(): string {
  const result = buildingStore.lastImportResult
  if (!result) return ''

  if (result.success) {
    return `✅ 成功导入 ${result.importedCount} 个楼体`
  } else {
    return `❌ 导入失败: ${result.errors[0] || '未知错误'}`
  }
}


</script>

<!-- 使用与BaseStationPanel相同的样式 -->
<style scoped>
.panel {
  display: flex;
  height: 100vh;
  position: absolute;
  top: 0;
  left: 60px; /* 为切换按钮留出空间 */
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
  background: #FFE0B2; /* 橙色系背景，区别于基站的蓝色 */
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
  background: linear-gradient(90deg, transparent, rgba(255, 152, 0, 0.1), transparent);
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
  background: linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%);
  border-color: #FF9800;
  box-shadow: 0 3px 12px rgba(255, 152, 0, 0.3);
  transform: translateX(6px);
}

.list li.active::after {
  content: '▶';
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #FF9800;
  font-size: 12px;
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

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}

.stats {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #eee;
  font-size: 12px;
  color: #666;
}

.action-buttons {
  margin-top: 15px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-create {
  width: 100%;
  padding: 10px;
  background: #FF9800;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.btn-create:hover {
  background: #F57C00;
}

.btn-create.active {
  background: #f44336;
}

.btn-create.active:hover {
  background: #da190b;
}

.btn-clear {
  width: 100%;
  padding: 8px;
  background: #f0f0f0;
  color: #666;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.btn-clear:hover:not(:disabled) {
  background: #e0e0e0;
}

.btn-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

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

.details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #FFE0B2;
  background: linear-gradient(135deg, #f5f5f5 0%, #FFF3E0 100%);
  margin: -15px -15px 20px -15px;
  padding: 15px 15px 12px 15px;
}

.details-header h3 {
  margin: 0;
  color: #E65100;
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
  font-family: 'Courier New', monospace;
}

.coordinate-input:focus {
  border-color: #FF9800;
  outline: none;
  box-shadow: 0 0 3px rgba(255, 152, 0, 0.3);
}

.unit {
  color: #666;
  font-size: 12px;
  min-width: 15px;
}

.geometry-section {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.geometry-section h4 {
  margin: 0 0 15px 0;
  color: #E65100;
  font-size: 15px;
}

.geometry-controls {
  display: grid;
  gap: 10px;
}

.geometry-controls label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin: 0;
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
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 12px;
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
  background: #FFE0B2;
  border-color: #FF9800;
}

.material-section {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.material-section h4 {
  margin: 0 0 15px 0;
  color: #E65100;
  font-size: 15px;
}

.material-section label {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #E65100;
}

.model-select {
  width: 100%;
  margin-top: 4px;
  padding: 6px 8px;
  border: 2px solid #FFE0B2;
  border-radius: 4px;
  background: white;
  font-size: 12px;
}

.model-select:focus {
  border-color: #FF9800;
  outline: none;
}

.model-description {
  margin-top: 8px;
  padding: 8px 10px;
  background: #FFF8F0;
  border-left: 3px solid #FF9800;
  border-radius: 0 4px 4px 0;
}

.model-description small {
  color: #555;
  line-height: 1.4;
  font-size: 11px;
}

.signal-parameters {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.signal-parameters label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin: 0;
  color: #555;
}

.signal-parameters input {
  width: 80px;
  padding: 4px 6px;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 12px;
}

.appearance-section {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.appearance-section h4 {
  margin: 0 0 15px 0;
  color: #E65100;
  font-size: 15px;
}

.appearance-section label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin-bottom: 8px;
  color: #555;
}

.color-input {
  width: 40px;
  height: 24px;
  border: 1px solid #ddd;
  border-radius: 3px;
  cursor: pointer;
}

.value-display {
  color: #E65100;
  font-size: 10px;
  font-weight: 600;
  min-width: 30px;
  text-align: right;
}

.range-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
  background: #e0e0e0;
  margin-top: 5px;
}

.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #FF9800;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.range-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #FF9800;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.opacity-slider {
  background: linear-gradient(to right, rgba(255, 152, 0, 0.1), rgba(255, 152, 0, 1));
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
  background: #FF9800;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-fly:hover {
  background: #F57C00;
}

.btn-duplicate {
  flex: 1;
  padding: 8px 12px;
  background: #9C27B0;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-duplicate:hover {
  background: #7B1FA2;
}

.import-section {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.btn-import {
  width: 100%;
  padding: 10px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
  margin-bottom: 10px;
}

.btn-import:hover:not(:disabled) {
  background: #45a049;
}

.btn-import:disabled {
  background: #cccccc;
  cursor: not-allowed;
}

.import-progress {
  margin-top: 8px;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: #f0f0f0;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 5px;
}

.progress-fill {
  height: 100%;
  background: #4CAF50;
  transition: width 0.3s ease;
}

.import-result {
  margin-top: 8px;
}

.result-message {
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}

.result-message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.result-message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

/* 分类列表样式 */
.building-categories {
  margin-bottom: 20px;
}

.category-section {
  margin-bottom: 15px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
}

.category-header {
  padding: 12px 15px;
  background: #f8f9fa;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background 0.2s;
  user-select: none;
}

.category-header:hover {
  background: #e9ecef;
}

.category-header.expanded {
  background: #e3f2fd;
  border-bottom: 1px solid #e0e0e0;
}

.category-icon {
  font-size: 12px;
  color: #666;
  min-width: 12px;
  transition: transform 0.2s;
}

.category-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}

.category-content {
  background: white;
}

.category-content ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.building-item {
  padding: 10px 15px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
  position: relative;
}

.building-item:hover {
  background: #f8f9fa;
}

.building-item:last-child {
  border-bottom: none;
}

.building-item.active {
  background: #e3f2fd;
  border-left: 3px solid #2196f3;
}

.manual-building.active {
  border-left-color: #4CAF50;
}

.imported-building.active {
  border-left-color: #FF9800;
}

.building-item span {
  display: block;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.building-item small {
  display: block;
  color: #666;
  font-size: 11px;
}

.imported-badge {
  position: absolute;
  top: 8px;
  right: 10px;
  background: #FF9800;
  color: white;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.empty-category {
  padding: 20px 15px;
  text-align: center;
  color: #999;
}

.empty-category small {
  font-style: italic;
}
</style>