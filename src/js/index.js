import mapboxgl from './mapbox-gl-js'
import OfflineManager from './offline-manager/OfflineManager'
//import { setType, getType } from 'mapbox-gl/src/source/source'
import OfflineRasterTileSource from './source/offline_raster_test'

// Add a utility for managing offline tile caches
mapboxgl.OfflineManager = OfflineManager

// Add offline raster tile sources
// mapboxgl.addSourceType('offline-raster', OfflineRasterTileSource)

export default mapboxgl
