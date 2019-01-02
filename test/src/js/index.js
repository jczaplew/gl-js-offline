import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import DrawRectangle from 'mapbox-gl-draw-rectangle-mode'

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

let createCacheMode = false

const modes = MapboxDraw.modes
modes.draw_rectangle = DrawRectangle

let draw = new MapboxDraw({
  modes: modes,
  displayControlsDefault: false
})

let offlineManager;

map.on('load', () => {
  offlineManager = new OfflineManager(map, dbOptions, () => {
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


    map.addControl(draw)
    map.on('draw.create', (d) => {
      console.log('create', d)
      makeCache(d.features[0].geometry)
    })
  })

  setTimeout(refreshCaches, 2000)

  document.querySelector('#create-cache').addEventListener('click', () => {
    createCacheMode = !createCacheMode
    if (createCacheMode) {
      draw.changeMode('draw_rectangle')
      document.querySelector('#create-cache').innerHTML = 'Cancel'
    } else {
      draw.changeMode('simple_select')
      document.querySelector('#create-cache').innerHTML = '+ New Cache'
    }
  })
})

function makeCache(geom) {
  let xs = geom.coordinates[0].map(ll => ll[0])
  let ys = geom.coordinates[0].map(ll => ll[1])

  let xMin = Math.min(...xs)
  let yMin = Math.min(...ys)
  let xMax = Math.max(...xs)
  let yMax = Math.max(...ys)

  offlineManager.makeCache({
    style: {
      sources: {
        'burwell': {
          type: 'offline-raster',
          tiles: ['https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png'],
          tileSize: 512,
        }
      }
    },
    bounds: [ xMin, yMin, xMax, yMax ],
    minZoom: 0,
    maxZoom: 3,
  }, (error, progress) => {
    console.log('progress', progress)
  }, (error) => {
    console.log('error', error)
  }, () => {
    console.log('done')
    refreshCaches()
  })
  createCacheMode = false
  draw.changeMode('simple_select')
  document.querySelector('#create-cache').innerHTML = '+ New Cache'

}

function formatCache(cache) {
  return `
  <div class="cache">
    <span>${cache.name}</span>
    <div class="show">show</div>
    <div class="remove">remove</div>
  </div>
  `
}

function refreshCaches() {
  offlineManager.getPacks((error, packs) => {
    document.querySelector('#cache-list').innerHTML = packs.map(formatCache).join(' ')
  })
}
