import {extend, pick } from 'mapbox-gl/src/util/util'
import { getImage, ResourceType } from 'mapbox-gl/src/util/ajax'
import {Event, ErrorEvent, Evented} from 'mapbox-gl/src/util/evented'
import loadTileJSON from 'mapbox-gl/src/source/load_tilejson'
import { normalizeTileURL } from 'mapbox-gl/src/util/mapbox'
import TileBounds from 'mapbox-gl/src/source/tile_bounds'
import Texture from 'mapbox-gl/src/render/texture'
import defaults from '../defaults'

class OfflineRasterTileSource extends Evented {
    type: 'offline-raster';
    id: string;
    minzoom: number;
    maxzoom: number;
    url: string;
    scheme: string;
    tileSize: number;

    bounds: ?[number, number, number, number];
    tileBounds: TileBounds;
    roundZoom: boolean;
    dispatcher: Dispatcher;
    map: Map;
    tiles: Array<string>;

    _loaded: boolean;
    _options: RasterSourceSpecification | RasterDEMSourceSpecification;
    _tileJSONRequest: ?Cancelable;

    constructor(id, options: RasterSourceSpecification | RasterDEMSourceSpecification, dispatcher: Dispatcher, eventedParent: Evented) {
        super();
        this.id = id;
        this.dispatcher = dispatcher;
        this.setEventedParent(eventedParent);

        this.type = 'offline-raster';
        this.minzoom = 0;
        this.maxzoom = 22;
        this.roundZoom = true;
        this.scheme = 'xyz';
        this.tileSize = 512;
        this._loaded = false;

        this._options = extend({}, options);
        extend(this, pick(options, ['url', 'scheme', 'tileSize']));
    }

    load() {
        this.fire(new Event('dataloading', {dataType: 'source'}));
        this._tileJSONRequest = loadTileJSON(this._options, this.map._transformRequest, (err, tileJSON) => {
            this._tileJSONRequest = null;
            if (err) {
                this.fire(new ErrorEvent(err));
            } else if (tileJSON) {
                extend(this, tileJSON);
                if (tileJSON.bounds) this.tileBounds = new TileBounds(tileJSON.bounds, this.minzoom, this.maxzoom);

                // `content` is included here to prevent a race condition where `Style#_updateSources` is called
                // before the TileJSON arrives. this makes sure the tiles needed are loaded once TileJSON arrives
                // ref: https://github.com/mapbox/mapbox-gl-js/pull/4347#discussion_r104418088
                this.fire(new Event('data', {dataType: 'source', sourceDataType: 'metadata'}));
                this.fire(new Event('data', {dataType: 'source', sourceDataType: 'content'}));
            }
        });
    }

    onAdd(map) {
        this.map = map;
        this.load();
    }

    onRemove() {
        if (this._tileJSONRequest) {
            this._tileJSONRequest.cancel();
            this._tileJSONRequest = null;
        }
    }

    serialize() {
        return extend({}, this._options);
    }

    hasTile(tileID) {
        return !this.tileBounds || this.tileBounds.contains(tileID.canonical);
    }

    loadTile(tile, callback) {
        const url = normalizeTileURL(tile.tileID.canonical.url(this.tiles, this.scheme), this.url, this.tileSize);
        const params = {
            request: this.map._transformRequest(url, ResourceType.Tile),
            uid: tile.uid,
            tileID: tile.tileID,
            type: this.type,
            source: this.id,
        };

        tile.request = this.getRasterImage(params, (err, img) => {
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

              const context = this.map.painter.context;
              const gl = context.gl;
              tile.texture = this.map.painter.getTileTexture(img.width);
              if (tile.texture) {
                  tile.texture.bind(gl.LINEAR, gl.CLAMP_TO_EDGE, gl.LINEAR_MIPMAP_NEAREST);
                  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
              } else {
                  tile.texture = new Texture(context, img, gl.RGBA);
                  tile.texture.bind(gl.LINEAR, gl.CLAMP_TO_EDGE, gl.LINEAR_MIPMAP_NEAREST);

                  if (context.extTextureFilterAnisotropic) {
                      gl.texParameterf(gl.TEXTURE_2D, context.extTextureFilterAnisotropic.TEXTURE_MAX_ANISOTROPY_EXT, context.extTextureFilterAnisotropicMax);
                  }
              }
              gl.generateMipmap(gl.TEXTURE_2D);

              tile.state = 'loaded';

              callback(null);
          }
        });

    }

    abortTile(tile, callback) {
        if (tile.request) {
            tile.request.cancel();
            delete tile.request;
        }
        callback();
    }

    unloadTile(tile, callback) {
        if (tile.texture) this.map.painter.saveTileTexture(tile.texture);
        callback();
    }

    hasTransition() {
        return false;
    }

    getRasterImage(params, callback) {
        // Check the local cache if this tile exists
        this.getArrayBufferLocal({
          // x: params.tileID.canonical.x,
          // y: params.tileID.canonical.y,
          // z: params.tileID.canonical.z,
          ...params.tileID.canonical,
          source: params.source
        }, (err, response) => {
          // If it doesn't, try to fetch it
          if (err || !response || !response.data) {
            if (this._options.debug) {
              console.log(`${this.id} - ${params.tileID.canonical.z}/${params.tileID.canonical.x}/${params.tileID.canonical.y} - cache miss`)
            }
            return getImage(params.request, callback)
          }

          if (this._options.debug) {
          console.log(`${this.id} - ${params.tileID.canonical.z}/${params.tileID.canonical.x}/${params.tileID.canonical.y} - cache hit`)
          }

          // If the tile was found in the cache format it and return it
          const img: HTMLImageElement = new window.Image();
          const URL = window.URL || window.webkitURL;
          img.onload = () => {
              callback(null, img);
              URL.revokeObjectURL(img.src);
          };
          const blob: Blob = new window.Blob([new Uint8Array(response.data)], { type: 'image/png' });
          (img: any).cacheControl = response.cacheControl;
          (img: any).expires = response.expires;
          img.width = this.tileSize;
          img.height = this.tileSize;
          img.src = response.data.byteLength ? URL.createObjectURL(blob) : transparentPngUrl;
        })
    }

    getArrayBufferLocal(tile, callback) {
      const open = indexedDB.open(this._options.dbname || defaults.dbname, this._options.dbversion || defaults.dbversion);
      open.onupgradeneeded = () => {
        indexedDB.deleteDatabase(this._options.dbname || defaults.dbname)
        return callback(null)
      }
      open.onsuccess = () => {
          let db = open.result;
          // We try/catch because onerror is not being called if the store is not found
          let transaction
          try {
            transaction = db.transaction('tiles', 'readonly')
          } catch(e) {
            if (this._options.debug) {
              console.error('Could not get transaction on tiles')
            }
            return callback(null)
          }

          let store
          try {
            store = transaction.objectStore('tiles')
          } catch(e) {
            if (this._options.debug) {
              console.error('Could not acquire objectStore "tiles"')
            }
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
        if (this._options.debug) {
          console.error(`Could not open database ${this._options.dbname || defaults.dbname} (version ${this._options.dbversion || defaults.dbversion})`)
        }
        callback('Could not open db')
      }
    }
}

export default OfflineRasterTileSource;
