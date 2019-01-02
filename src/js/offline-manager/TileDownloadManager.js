// @flow

import TileDownloader from './TileDownloader'
import { getJSON } from 'mapbox-gl/src/util/ajax'
import { normalizeSourceURL } from 'mapbox-gl/src/util/mapbox'
import config from 'mapbox-gl/src/util/config'

class TileDownloadManager {
  constructor(db, params, progressCallback, errorCallback, done) {
    this.db = db
    this.sources = []
    this.params = params
    this.done = done
    this.completed = 0
    this.downloadSize = 0

    // Resolve all the source URLs of the data sources we will cache
    let sourceTasks = Object.keys(params.style.sources).map(source => {
      return new Promise((resolve, reject) => {
        if (params.style.sources[source].tiles) {
          this.sources.push({
            name: source,
            tileSize: params.style.sources[source].tileSize || 512,
            tileURLs: params.style.sources[source].tiles
          })
          resolve()
        } else if (params.style.sources[source].url) {
          // TODO: need to get the access token from elsewhere
          let jsonURL = (params.style.sources[source].url.indexOf('http') > -1 || params.style.sources[source].url.indexOf('mapbox') > -1) ? normalizeSourceURL(params.style.sources[source].url, config.accessToken) : params.style.sources[source].url
          getJSON({ url: jsonURL }, (error, data) => {
            this.sources.push({
              name: source,
              tileSize: params.style.sources[source].tileSize || 512,
              tileURLs: data.tiles
            })
            resolve()
          })
        } else {
          reject(null)
        }
      })
    })

    // Resolve all the URLs
    Promise.all(sourceTasks).then(() => {
      // Create a TileDownloader for each data source
      this.sourceDownloads = this.sources.map(source => {
        return new TileDownloader(db, params, source, progressCallback, errorCallback, this.sourceDownloadComplete.bind(this))
      })
    })
  }

  sourceDownloadComplete(bytes) {
  //  console.log('TileDownloadManager:sourceDownloadComplete', bytes)
    this.completed += 1
    this.downloadSize += bytes

    if (this.completed === this.sources.length) {
      let transaction = this.db.transaction(['caches'], 'readwrite')
      let store = transaction.objectStore('caches')

      this.params.size = this.downloadSize
      let add = store.put(this.params)

      add.onerror = event => {
        console.log('TileDownloadManager:error - ', event)
      }

      this.done(null, this.params)
    }
  }

  // Send a signal to each TileDownder to cease downloads
  abort() {
  //  console.log('TileDownloadManager:abort')
    this.sourceDownloads.forEach(s => {
      s.abort(() => {

      })
    })
  }

}

export default TileDownloadManager
