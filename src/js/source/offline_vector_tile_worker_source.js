// @flow

import { getArrayBuffer } from 'mapbox-gl/src/util/ajax'
import vt from '@mapbox/vector-tile'
import Protobuf from 'pbf'
import WorkerTile from 'mapbox-gl/src/source/worker_tile'
import { extend } from 'mapbox-gl/src/util/util'
import { getEntriesByName } from 'mapbox-gl/src/util/performance'
//const vt = require('@mapbox/vector-tile')
//const Protobuf = require('pbf');
//const WorkerTile = require('./worker_tile');
//const util = require('../util/util');
//const perf = require('../util/performance');

import type {
    WorkerSource,
    WorkerTileParameters,
    WorkerTileCallback,
    TileParameters
} from 'mapbox-gl/src/source/worker_source'

import type { PerformanceResourceTiming } from 'mapbox-gl/src/types/performance_resource_timing'
import type Actor from 'mapbox-gl/src/util/actor'
import type StyleLayerIndex from 'mapbox-gl/src/style/style_layer_index'
import type { Callback } from 'mapbox-gl/src/types/callback'

export type LoadVectorTileResult = {
    vectorTile: VectorTile;
    rawData: ArrayBuffer;
    expires?: any;
    cacheControl?: any;
    resourceTiming?: Array<PerformanceResourceTiming>;
};

/**
 * @callback LoadVectorDataCallback
 * @param error
 * @param vectorTile
 * @private
 */
export type LoadVectorDataCallback = Callback<?LoadVectorTileResult>;

export type AbortVectorData = () => void;
export type LoadVectorData = (params: WorkerTileParameters, callback: LoadVectorDataCallback) => ?AbortVectorData;

/**
 * @private
 */
 function loadVectorTileXHR(params: WorkerTileParameters, callback: LoadVectorDataCallback) {
   const xhr = getArrayBuffer(params.request, (err, response) => {
       if (err) {
           callback(err);
       } else if (response) {
           callback(null, {
               vectorTile: new vt.VectorTile(new Protobuf(response.data)),
               rawData: response.data,
               cacheControl: response.cacheControl,
               expires: response.expires
           });
       }
   });
   return () => {
       xhr.abort();
       callback();
   };
 }

function getArrayBufferLocal(tile, callback: Callback<{data: ArrayBuffer, cacheControl: ?string, expires: ?string}>) {
  const open = indexedDB.open('t1lecache', 1.0);
  open.onupgradeneeded = () => {
    indexedDB.deleteDatabase('t1lecache')
    return callback(null)
  }
  open.onsuccess = () => {
      let db = open.result;
      // We try/catch because onerror is not being called if the store is not found
      let transaction
      try {
        transaction = db.transaction('tiles', 'readonly')
      } catch(e) {
        return callback(null)
      }

      let store
      try {
        store = transaction.objectStore('tiles')
      } catch(e) {
        return callback(null)
      }

      let req = store.get(`${tile.z}|${tile.x}|${tile.y}|${tile.source}`);
      req.onsuccess = (event) => {
        if (!event.target || !event.target.result) {
        //  console.log('cache miss', `${tile.z}|${tile.x}|${tile.y}|${tile.source}`)
          return callback(null, null);
        }
      //  console.log('cache hit', `${tile.z}|${tile.x}|${tile.y}|${tile.source}`)
        callback(null, event.target.result);
      };
      req.onerror = (event) => {
        callback(new Error('could not get tile from indexedDB'));
      };
  };
  open.onerror = () => {
    console.log('could not open tilecache')
    callback('Could not open db')
  }
};

function loadVectorTile(params: WorkerTileParameters, callback: LoadVectorDataCallback) {
    getArrayBufferLocal({
      x: params.tileID.canonical.x,
      y: params.tileID.canonical.y,
      z: params.tileID.canonical.z,
      //...params.tileID.canonical,
      source: params.source
    }, (err, response) => {
      if (err || !response || !response.data) {
        return loadVectorTileXHR(params, callback)
      }
      callback(null, {
          vectorTile: new vt.VectorTile(new Protobuf(response.data)),
          rawData: response.data,
          cacheControl: response.cacheControl,
          expires: response.expires
      });
    })
}

/**
 * The {@link WorkerSource} implementation that supports {@link VectorTileSource}.
 * This class is designed to be easily reused to support custom source types
 * for data formats that can be parsed/converted into an in-memory VectorTile
 * representation.  To do so, create it with
 * `new VectorTileWorkerSource(actor, styleLayers, customLoadVectorDataFunction)`.
 *
 * @private
 */
class OfflineVectorTileWorkerSource implements WorkerSource {
    actor: Actor;
    layerIndex: StyleLayerIndex;
    loadVectorData: LoadVectorData;
    loading: { [string]: WorkerTile };
    loaded: { [string]: WorkerTile };

    /**
     * @param [loadVectorData] Optional method for custom loading of a VectorTile
     * object based on parameters passed from the main-thread Source. See
     * {@link VectorTileWorkerSource#loadTile}. The default implementation simply
     * loads the pbf at `params.url`.
     */
    constructor(actor: Actor, layerIndex: StyleLayerIndex, loadVectorData: ?LoadVectorData) {
        this.actor = actor;
        this.layerIndex = layerIndex;
        this.loadVectorData = loadVectorData || loadVectorTile;
        this.loading = {};
        this.loaded = {};
    }

    /**
     * Implements {@link WorkerSource#loadTile}. Delegates to
     * {@link VectorTileWorkerSource#loadVectorData} (which by default expects
     * a `params.url` property) for fetching and producing a VectorTile object.
     */
    loadTile(params: WorkerTileParameters, callback: WorkerTileCallback) {
        const uid = params.uid;

        if (!this.loading)
            this.loading = {};

        const workerTile = this.loading[uid] = new WorkerTile(params);
        workerTile.abort = this.loadVectorData(params, (err, response) => {
            delete this.loading[uid];

            if (err || !response) {
                return callback(err);
            }

            const rawTileData = response.rawData;
            const cacheControl = {};
            if (response.expires) cacheControl.expires = response.expires;
            if (response.cacheControl) cacheControl.cacheControl = response.cacheControl;
            const resourceTiming = {};
            if (params.request && params.request.collectResourceTiming) {
                const resourceTimingData = getEntriesByName(params.request.url);
                // it's necessary to eval the result of getEntriesByName() here via parse/stringify
                // late evaluation in the main thread causes TypeError: illegal invocation
                if (resourceTimingData)
                    resourceTiming.resourceTiming = JSON.parse(JSON.stringify(resourceTimingData));
            }

            workerTile.vectorTile = response.vectorTile;
            workerTile.parse(response.vectorTile, this.layerIndex, this.actor, (err, result) => {
                if (err || !result) return callback(err);

                // Transferring a copy of rawTileData because the worker needs to retain its copy.
                callback(null, extend({rawTileData: rawTileData.slice(0)}, result, cacheControl, resourceTiming));
            });

            this.loaded = this.loaded || {};
            this.loaded[uid] = workerTile;
        });
    }

    /**
     * Implements {@link WorkerSource#reloadTile}.
     */
    reloadTile(params: WorkerTileParameters, callback: WorkerTileCallback) {
        const loaded = this.loaded,
            uid = params.uid,
            vtSource = this;
        if (loaded && loaded[uid]) {
            const workerTile = loaded[uid];
            workerTile.showCollisionBoxes = params.showCollisionBoxes;

            if (workerTile.status === 'parsing') {
                workerTile.reloadCallback = callback;
            } else if (workerTile.status === 'done') {
                workerTile.parse(workerTile.vectorTile, this.layerIndex, this.actor, done.bind(workerTile));
            }

        }

        function done(err, data) {
            if (this.reloadCallback) {
                const reloadCallback = this.reloadCallback;
                delete this.reloadCallback;
                this.parse(this.vectorTile, vtSource.layerIndex, vtSource.actor, reloadCallback);
            }

            callback(err, data);
        }
    }

    /**
     * Implements {@link WorkerSource#abortTile}.
     *
     * @param params
     * @param params.uid The UID for this tile.
     */
    abortTile(params: TileParameters, callback: WorkerTileCallback) {
        const loading = this.loading,
            uid = params.uid;
        if (loading && loading[uid] && loading[uid].abort) {
            loading[uid].abort();
            delete loading[uid];
        }
        callback();
    }

    /**
     * Implements {@link WorkerSource#removeTile}.
     *
     * @param params
     * @param params.uid The UID for this tile.
     */
    removeTile(params: TileParameters, callback: WorkerTileCallback) {
        const loaded = this.loaded,
            uid = params.uid;
        if (loaded && loaded[uid]) {
            delete loaded[uid];
        }
        callback();
    }
}

module.exports = OfflineVectorTileWorkerSource;
