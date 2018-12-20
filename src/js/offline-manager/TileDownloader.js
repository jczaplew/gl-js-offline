// @flow

import { getTiles } from './get_tiles'
import { deletePack } from './delete_pack'
import { getArrayBuffer } from 'mapbox-gl/src/util/ajax'

class TileDownloader {
  constructor(db, params, source, progressCallback, errorCallback, done) {
    this.aborted = false
    this.paused = false
    this.downloaded = []
    this.bytes = 0
    this.params = params
    this.source = source
    this.progressCallback = progressCallback
    this.errorCallback = errorCallback
    this.done = done
    this.db = db

    this.start()
  }

  start() {
    //console.log('TileDownloader:start')
    let allTiles = getTiles(this.params.bounds, this.params.minZoom, ((this.source.tileSize < 512) ? (this.params.maxZoom + 1) : this.params.maxZoom))

    let i = 0

    let process = tile => {
      this.getTile(tile).then((b) => {
        this.bytes += b
        i++

        this.downloaded.push(tile)
        this.progressCallback(null, { fetched: this.downloaded.length, total: allTiles.length, source: this.source.name })

        if (i < allTiles.length && !this.aborted) {
          process(allTiles[i])
        } else {
          //console.log('TileDownloader:done')
          this.done(this.bytes)
        }
      }).catch(e => {
        this.errorCallback(e)
      })
    }

    process(allTiles[i])

    // IMHO this is a more elegant way of doing the above, but Mapbox GL JS doesn't use ES2017
    // for (const tile of allTiles) {
    //   if (this.aborted) {
    //     break
    //   }
    //   try {
    //     let b = await this.getTile(tile)
    //     this.bytes += b
    //     this.downloaded.push(tile)
    //     this.progressCallback(null, { fetched: this.downloaded.length, total: allTiles.length, source: this.source.name })
    //   } catch(e) {
    //     this.errorCallback(error)
    //   }
    // }

  }

  abort(callback) {
  //  console.log('TileDownloader:abort')
    this.aborted = true
    this.cleanup(() => {
      callback()
    })
  }

  cleanup(callback) {
    deletePack(this.db, this.params.name, callback)
  }


  getTile(tile) {
    return new Promise((resolve, reject) => {
      // Grab a random item so we distribute across multiple domains if possible
      if (!tile) {
        return reject()
      }
      let url = this.source.tileURLs[Math.floor(Math.random()*this.source.tileURLs.length)]
      url = url.replace('{z}', tile[0]).replace('{x}', tile[1]).replace('{y}', tile[2])

      getArrayBuffer({ url: url }, (error, response) => {
        //fetched++
        if (!response) {
          // TODO: Maybe put something in the cache anyways?
          return resolve(null)
        }
        let transaction = this.db.transaction(['tiles'], 'readwrite')
        transaction.oncomplete = function(event) {
          //
        }
        transaction.onerror = function(event) {
          console.log('error', event)
        }

        let store = transaction.objectStore('tiles')

        let add = store.put({
          'tile_id': `${tile[0]}|${tile[1]}|${tile[2]}|${this.source.name}`,
          'cache': this.params.name,
          'expires': response.expires,
          'cacheControl': response.cacheControl,
          'data': response.data,
        })

        add.onerror = function(error) {
          console.log('error adding tile', error)
        }
        resolve(response.data.byteLength)
      })
    })
  }

}

export default TileDownloader
