// @flow

import { getTiles } from './get_tiles'
import { deletePack } from './delete_pack'
import TileDownloadManager from './TileDownloadManager'
import OfflineRasterTileSource from '../source/offline_raster_tile_source'

import { getArrayBuffer } from 'mapbox-gl/src/util/ajax'

const defaults = {
  dbname: 'tile-cache',
  dbversion: 1.0,
  dbsize: ((1024 * 1024) * 10),
  debug: false
}

class OfflineManager {
  constructor(map, props, callback) {
    this.options = {
      dbname: props.dbname || defaults.dbname,
      dbversion: props.dbversion || defaults.dbverison,
      dbsize: props.dbsize || defaults.dbsize,
      debug: props.debug || defaults.debug
    }

    this.db = null

    if (this.options.debug) {
      console.log(`Initializing tilecache ${this.options.dbname} (version ${this.options.dbversion})`)
    }

    let open = indexedDB.open(this.options.dbname, this.options.dbversion)
    open.onupgradeneeded = () => {
      // Set up the schema
      this.db = open.result
      let metaStore = this.db.createObjectStore('caches', { keyPath: 'name' })
      let metaIdx = metaStore.createIndex('cache_name_idx', 'name', { unique: true })

      let store = this.db.createObjectStore('tiles', { keyPath: 'tile_id' })
      let idx = store.createIndex('tilecache_cache_idx', 'tile_id', { unique: false })
      callback()
    }
    open.onsuccess = (event) => {
      if (this.db) return
      this.db = event.target.result
    }
    // Add the offline raster tile source
    map.addSourceType('offline-raster', OfflineRasterTileSource, () => {
      callback()
    })
  }

  // Fetch an individual tile
  tile(zoom, lng, lat) {
    return getTiles([lng, lat], zoom, zoom)
  }

  // Retreive info about a single cache
  getPack(name, callback) {
    let req = this.db.transaction('caches', 'readonly')
      .objectStore('caches')
      .get(`${name}`)
    req.onsuccess = (event) => {
      callback(null, event.target.result)
    }
    req.onerror = (event) => {
      callback('Error fetching cache')
    }
  }

  // Retrieve all caches
  getPacks(callback) {
    let req = this.db.transaction('caches', 'readonly')
      .objectStore('caches')
      .getAll()
    req.onsuccess = (event) => {
      callback(null, event.target.result)
    }
    req.onerror = (event) => {
      callback('Error fetching caches')
    }
  }

  // Delete a single cache
  deletePack(name, callback) {
    deletePack(this.db, name, callback)
  }

  // Delete all caches
  deleteAll(callback) {
    let tileTransaction = this.db.transaction('tiles', 'readwrite')
    let tileStore = tileTransaction.objectStore('tiles')

    tileStore.openCursor().onsuccess = (event) => {
      var cursor = event.target.result;
      if (cursor) {
        let deleteTile = cursor.delete(cursor.value.tile_id)
        deleteTile.onsuccess = function() {
          cursor.continue()
        }
        deleteTile.onerror = function() {
          cursor.continue()
        }
      } else {
        // Finally delete the cache record
        let cacheTransaction = this.db.transaction('caches', 'readwrite')
        let cacheStore = cacheTransaction.objectStore('caches')
        cacheStore.openCursor().onsuccess = (event) => {
          var cursor = event.target.result
          if (cursor) {
            let deleteMeta = cursor.delete(cursor.value.name)
            deleteMeta.onsuccess = () => {
              cursor.continue()
            }
            deleteMeta.onerror = () => {
              cursor.continue()
            }
          } else {
            callback(null)
          }
        }
      }
    }
  }

  // Estimate the size of a cache
  estimateCache(params) {
    const estimates = {
      'vector': 60,
      'offline-vector': 60,
      'raster-dem': 100,
      'offline-raster-dem': 100,
      'raster': 25,
      'offline-raster': 25
    }
    return Object.keys(params.style.sources).map(source => {
      let nTiles = getTiles(params.bounds, params.minZoom, ((params.style.sources[source].tileSize < 512) ? (params.maxZoom + 1) : params.maxZoom)).length

      return estimates[params.style.sources[source].type] * nTiles
    }).reduce((a, b) => { return a + b }, 0)
  }

  /*
    Create a new cache
      + Validates inputs
      + Returns a TileDownloadManager
  */
  makeCache(params, progressCallback, errorCallback, done) {
    if (!params) {
      return errorCallback('No parameters supplied')
    }
    if (!params.style.sources || !Object.keys(params.style.sources).length) {
      return errorCallback('Please provide one or more sources to cache')
    }
    if (!params.bounds || !params.bounds.length || params.bounds.length != 4) {
      return errorCallback('Please provide a valid bbox ( [minLng, minLat, maxLng, maxLat] )')
    }
    if (!params.hasOwnProperty('minZoom')) {
      return errorCallback('A minZoom is required')
    }
    if (!params.maxZoom) {
      return errorCallback('A maxZoom is required')
    }
    // If no name is provided set it to the current time
    params.name = params.name || new Date().toISOString().slice(0,19).replace('T', ':')

    let src = params

    /*
      TODO: Check if the provided name already exists - if so append the current time
    */

    src.size = 0
    src['created'] = new Date()

    // Immediately add the requested cache to the list of caches
    let transaction = this.db.transaction(['caches'], 'readwrite')

    let store = transaction.objectStore('caches')
    store.onerror = event => {
      console.log('ERROR ACQUIRING STORE - ', event)
    }
    let add = store.put(src)

    add.onerror = event => {
      console.log('ERROR ADDING CACHE - ', event)
    }

    let modifiedSources = {}
    Object.keys(params.style.sources).forEach(source => {
      modifiedSources[source] = params.style.sources[source]
      modifiedSources[source].type = (modifiedSources[source].type.indexOf('offline') > -1) ? modifiedSources[source].type : `offline-${modifiedSources[source].type}`
    })

    params.style.sources = modifiedSources

    // Return a TileDownloadManager that has an abort method to cancel the creation of the cache
    return new TileDownloadManager(this.db, params, progressCallback, errorCallback, done)
  }

}

export default OfflineManager
