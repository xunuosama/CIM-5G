import { defineStore } from 'pinia'
import type { BaseStation, Antenna } from '../types.ts'

export const useBaseStationStore = defineStore('baseStations', {
    state: () => ({
        stations: [] as BaseStation[],     // 所有基站数据
        selectedId: null as string | null,  // 当前选中的基站ID
        isCreatingMode: false  // 新增：是否处于创建模式
    }),

    actions: {
        toggleCreatingMode() {
            this.isCreatingMode = !this.isCreatingMode
        },

        setCreatingMode(mode: boolean) {
            this.isCreatingMode = mode
        },
        // 添加新基站
        addStation(station: BaseStation) {
            this.stations.push(station)
        },

        // 选中指定基站
        selectStation(id: string) {
            this.selectedId = id
        },

        // 更新基站信息
        updateStation(id: string, data: Partial<BaseStation>) {
            const index = this.stations.findIndex(s => s.id === id)
            if (index !== -1) {
                this.stations[index] = { ...this.stations[index], ...data }
            }
        },

        // 删除基站
        removeStation(id: string) {
            const index = this.stations.findIndex(s => s.id === id)
            if (index !== -1) {
                const stationToRemove = this.stations[index]
                this.stations.splice(index, 1)
                // 如果删除的是当前选中的基站，清除选中状态
                if (this.selectedId === id) {
                    this.selectedId = null
                }
                // 触发自定义事件，通知界面更新
                window.dispatchEvent(new CustomEvent('removeStationFromMap', { detail: { stationId: id,station: stationToRemove  } }))

            }
        },

        // 为基站添加天线
        addAntennaToStation(stationId: string, antenna: Antenna) {
            const station = this.stations.find(s => s.id === stationId)
            if (station) {
                station.antennas.push(antenna)
            }
        },

        // 从基站删除天线
        removeAntennaFromStation(stationId: string, antennaId: string) {
            const station = this.stations.find(s => s.id === stationId)
            if (station) {
                const antennaIndex = station.antennas.findIndex(a => a.id === antennaId)
                if (antennaIndex !== -1) {
                    // 先触发清除可视化事件
                    window.dispatchEvent(new CustomEvent('removeAntennaVisualization', {
                        detail: {
                            stationId,
                            antennaId
                        }
                    }))
                }
                const index = station.antennas.findIndex(a => a.id === antennaId)
                if (index !== -1) {
                    station.antennas.splice(index, 1)
                }
            }
        },


        // 清空所有基站数据
        clearAllStations() {
            this.stations = []
            this.selectedId = null
            this.isCreatingMode = false  // 清空时也退出创建模式
            window.dispatchEvent(new CustomEvent('clearAllStationsFromMap'))
        },
    },

    getters: {
        // 获取当前选中的基站
        selectedStation(state): BaseStation | null {
            return state.stations.find(s => s.id === state.selectedId) || null
        },

        // 获取基站总数
        totalStations(state): number {
            return state.stations.length
        },

        // 获取总天线数
        totalAntennas(state): number {
            return state.stations.reduce((total, station) => total + station.antennas.length, 0)
        },
        // 新增：Three.js射线追踪天线统计
        threeJSRayTracingAntennas(state): number {
            return state.stations.reduce((total, station) =>
                    total + station.antennas.filter(antenna =>
                        antenna.rayTracingType === 'threejs' && antenna.threeJSRayTracing.enabled
                    ).length, 0
            )
        },

        // 新增：活跃射线追踪天线统计
        activeRayTracingAntennas(state): { geometric: number, threejs: number } {
            let geometric = 0, threejs = 0

            state.stations.forEach(station => {
                station.antennas.forEach(antenna => {
                    switch (antenna.rayTracingType) {
                        case 'geometric':
                            if (antenna.visualization.enabled) geometric++
                            break
                        case 'threejs':
                            if (antenna.threeJSRayTracing.enabled) threejs++
                            break

                    }
                })
            })

            return { geometric, threejs}
        }
    }
})