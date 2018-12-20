// @flow

const ajax = require('../util/ajax');
const util = require('../util/util');
const {Evented} = require('../util/evented');
const normalizeURL = require('../util/mapbox').normalizeTileURL;
const browser = require('../util/browser');
const {OverscaledTileID} = require('./tile_id');
const RasterTileSource = require('./raster_tile_source');

import type {Source} from './source';
import type Dispatcher from '../util/dispatcher';
import type Tile from './tile';
import type {Callback} from '../types/callback';


 function loadImageXHR(params, callback) {
   ajax.getImage()
   const xhr = ajax.getArrayBuffer(params.request, (err, response) => {
       if (err) {
           callback(err);
       } else if (response) {
           console.log('live hit dem')
           const img: HTMLImageElement = new window.Image();
           const URL = window.URL || window.webkitURL;
           img.onload = () => {
               callback(null, img);
               URL.revokeObjectURL(img.src);
           };
           const blob: Blob = new window.Blob([new Uint8Array(response.data)], { type: 'image/png' });
           (img: any).cacheControl = response.cacheControl;
           (img: any).expires = response.expires;
           img.width = 256
           img.height = 256
           img.src = response.data.byteLength ? URL.createObjectURL(blob) : transparentPngUrl;

           callback(null, img)
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
    console.log('delete t1lecache')
    return callback(null)
  }
  open.onsuccess = () => {
      let db = open.result;
      // We try/catch because onerror is not being called if the store is not found
      let transaction
      try {
        transaction = db.transaction('tiles', 'readonly')
      } catch(e) {
        console.log('could not get transaction')
        return callback(null)
      }

      let store
      try {
        store = transaction.objectStore('tiles')
      } catch(e) {
        console.log('could not get store')
        return callback(null)
      }

      let req = store.get(`${tile.z}|${tile.x}|${tile.y}|${tile.source}`);
      req.onsuccess = (event) => {
        if (!event.target || !event.target.result) {
          return callback(null, null);
        }
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

function getImage(params, callback) {
    getArrayBufferLocal({
      x: params.tileID.canonical.x,
      y: params.tileID.canonical.y,
      z: params.tileID.canonical.z,
    //  ...params.tileID.canonical,
      source: params.source
    }, (err, response) => {
      if (err || !response || !response.data) {
        return ajax.getImage(params.request, callback)
        //return loadImageXHR(params, callback)
      }

      const img: HTMLImageElement = new window.Image();
      const URL = window.URL || window.webkitURL;
      img.onload = () => {
          callback(null, img);
          URL.revokeObjectURL(img.src);
      };
      const blob: Blob = new window.Blob([new Uint8Array(response.data)], { type: 'image/png' });
      (img: any).cacheControl = response.cacheControl;
      (img: any).expires = response.expires;
      img.width = 256
      img.height = 256
      img.src = response.data.byteLength ? URL.createObjectURL(blob) : transparentPngUrl;

    //  callback(null, img)

    })
}

class OfflineRasterDEMTileSource extends RasterTileSource implements Source {
    encoding: "mapbox" | "terrarium";

    constructor(id: string, options: RasterDEMSourceSpecification, dispatcher: Dispatcher, eventedParent: Evented) {
        super(id, options, dispatcher, eventedParent);
        this.type = 'offline-raster-dem';
        this.maxzoom = 22;
        this._options = util.extend({}, options);
        this.encoding = options.encoding || "mapbox";
    }

    serialize() {
        return {
            type: 'offline-raster-dem',
            url: this.url,
            tileSize: this.tileSize,
            tiles: this.tiles,
            bounds: this.bounds,
            encoding: this.encoding
        };
    }

    loadTile(tile: Tile, callback: Callback<void>) {
        const url = normalizeURL(tile.tileID.canonical.url(this.tiles, this.scheme), this.url, this.tileSize);
        const params = {
            request: this.map._transformRequest(url, ajax.ResourceType.Tile),
          //  request: url,
            uid: tile.uid,
            tileID: tile.tileID,
            type: this.type,
            source: this.id,
        };

        tile.request = getImage(params, imageLoaded.bind(this));

        tile.neighboringTiles = this._getNeighboringTiles(tile.tileID);
        function imageLoaded(err, img) {
            delete tile.request;
            if (tile.aborted) {
                tile.state = 'unloaded';
                callback(null);
            } else if (err) {
                tile.state = 'errored';
                callback(err);
            } else if (img) {
                if (this.map._refreshExpiredTiles) tile.setExpiryData(img);
                delete (img: any).cacheControl;
                delete (img: any).expires;

                const rawImageData = browser.getImageData(img);
                const params = {
                    uid: tile.uid,
                    coord: tile.tileID,
                    source: this.id,
                    rawImageData: rawImageData,
                    encoding: this.encoding
                };

                if (!tile.workerID || tile.state === 'expired') {
                    tile.workerID = this.dispatcher.send('loadDEMTile', params, done.bind(this));
                }
            }
        }

        function done(err, dem) {
            if (err) {
                tile.state = 'errored';
                callback(err);
            }

            if (dem) {
                tile.dem = dem;
                tile.needsHillshadePrepare = true;
                tile.state = 'loaded';
                callback(null);
            }
        }
    }


    _getNeighboringTiles(tileID: OverscaledTileID) {
        const canonical = tileID.canonical;
        const dim = Math.pow(2, canonical.z);

        const px = (canonical.x - 1 + dim) % dim;
        const pxw = canonical.x === 0 ? tileID.wrap - 1 : tileID.wrap;
        const nx = (canonical.x + 1 + dim) % dim;
        const nxw = canonical.x + 1 === dim ? tileID.wrap + 1 : tileID.wrap;

        const neighboringTiles = {};
        // add adjacent tiles
        neighboringTiles[new OverscaledTileID(tileID.overscaledZ, pxw, canonical.z, px, canonical.y).key] = {backfilled: false};
        neighboringTiles[new OverscaledTileID(tileID.overscaledZ, nxw, canonical.z, nx, canonical.y).key] = {backfilled: false};

        // Add upper neighboringTiles
        if (canonical.y > 0) {
            neighboringTiles[new OverscaledTileID(tileID.overscaledZ, pxw, canonical.z, px, canonical.y - 1).key] = {backfilled: false};
            neighboringTiles[new OverscaledTileID(tileID.overscaledZ, tileID.wrap, canonical.z, canonical.x, canonical.y - 1).key] = {backfilled: false};
            neighboringTiles[new OverscaledTileID(tileID.overscaledZ, nxw, canonical.z, nx, canonical.y - 1).key] = {backfilled: false};
        }
        // Add lower neighboringTiles
        if (canonical.y + 1 < dim) {
            neighboringTiles[new OverscaledTileID(tileID.overscaledZ, pxw, canonical.z, px, canonical.y + 1).key] = {backfilled: false};
            neighboringTiles[new OverscaledTileID(tileID.overscaledZ, tileID.wrap, canonical.z, canonical.x, canonical.y + 1).key] = {backfilled: false};
            neighboringTiles[new OverscaledTileID(tileID.overscaledZ, nxw, canonical.z, nx, canonical.y + 1).key] = {backfilled: false};
        }

        return neighboringTiles;
    }


    unloadTile(tile: Tile) {
        if (tile.demTexture) this.map.painter.saveTileTexture(tile.demTexture);
        if (tile.fbo) {
            tile.fbo.destroy();
            delete tile.fbo;
        }
        if (tile.dem) delete tile.dem;
        delete tile.neighboringTiles;

        tile.state = 'unloaded';
        this.dispatcher.send('removeDEMTile', { uid: tile.uid, source: this.id }, undefined, tile.workerID);
    }

}

module.exports = OfflineRasterDEMTileSource;
