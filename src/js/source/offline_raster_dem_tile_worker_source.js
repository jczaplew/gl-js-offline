// @flow

import { DEMData } from 'mapbox-gl/src/data/dem_data'

import type Actor from 'mapbox-gl/src/util/actor'
import type {
    WorkerDEMTileParameters,
    WorkerDEMTileCallback,
    TileParameters
} from 'mapbox-gl/src/source/worker_source'


class OfflineRasterDEMTileWorkerSource {
    actor: Actor;
    loading: {[string]: DEMData};
    loaded: {[string]: DEMData};

    constructor() {
        this.loading = {};
        this.loaded = {};
    }

    loadTile(params: WorkerDEMTileParameters, callback: WorkerDEMTileCallback) {
        const uid = params.uid,
            encoding = params.encoding;

        const dem = new DEMData(uid);
        this.loading[uid] = dem;
        dem.loadFromImage(params.rawImageData, encoding);
        delete this.loading[uid];

        this.loaded = this.loaded || {};
        this.loaded[uid] = dem;
        callback(null, dem);
    }

    removeTile(params: TileParameters) {
        const loaded = this.loaded,
            uid = params.uid;
        if (loaded && loaded[uid]) {
            delete loaded[uid];
        }
    }
}

module.exports = OfflineRasterDEMTileWorkerSource;
