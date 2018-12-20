//import mapboxgl from '../../../src/js/index'
import mapboxgl from 'mapbox-gl'
// Add a utility for managing offline tile caches
import OfflineManager from '../../../src/js/offline-manager/OfflineManager'

import mapbox_access_token from './mapbox_access_token'
mapboxgl.accessToken = mapbox_access_token
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v9'
});

const dbOptions = {
  dbname: 'tile-cache',
  dbversion: 1.0,
  dbsize: ((1024 * 1024) * 10),
  debug: true
}



map.on('load', () => {
  const offlineManager = new OfflineManager(map, dbOptions, () => {
    // ready

    map.addSource('burwell', {
      type: 'offline-raster',
      tiles: ['https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png'],
      tileSize: 512,
      ...dbOptions
    })

    map.addLayer({
      "id": "burwell",
      "type": "raster",
      "source": "burwell",
      "minzoom": 0,
      "maxzoom": 18,
      "paint": {
        "raster-opacity": 0.6
      }
    })
  })




})
