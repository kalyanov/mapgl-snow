import * as dat from 'dat.gui';
import { load } from '@2gis/mapgl';
import { Snow } from '../src';

load().then((mapgl) => {
    const map = ((window as any).map = new mapgl.Map('map', {
        center: [82.920412, 55.030111],
        zoom: 15,
        key: '042b5b75-f847-4f2a-b695-b5f58adc9dfd',
        zoomControl: false,
    }));

    const snow = ((window as any).snow = new Snow(map));

    const gui = new dat.GUI();
    const snowConfig = {
        dispersion: 50,
        velocityX: 0,
        velocityY: 0,
        velocityZ: 500,
        particleNumber: 50000,
        size: 6,
        color: [255, 255, 255, 0.7],
        minZoom: 9,
    };

    gui.add(snowConfig, 'dispersion', 0, 2500).onChange(() => snow.setOptions(snowConfig));
    gui.add(snowConfig, 'velocityX', -5000, 5000).onChange(() => snow.setOptions(snowConfig));
    gui.add(snowConfig, 'velocityY', -5000, 5000).onChange(() => snow.setOptions(snowConfig));
    gui.add(snowConfig, 'velocityZ', -5000, 5000).onChange(() => snow.setOptions(snowConfig));
    gui.add(snowConfig, 'particleNumber', 0, 100000).onChange(() => snow.setOptions(snowConfig));
    gui.add(snowConfig, 'size', 0, 50).onChange(() => snow.setOptions(snowConfig));
    gui.add(snowConfig, 'minZoom', 0, 20).onChange(() => snow.setOptions(snowConfig));
    gui.add({ color: `rgba(${snowConfig.color.join(',')})` }, 'color').onChange((str: string) => {
        snowConfig.color = parseColor(str, snowConfig.color);
        snow.setOptions(snowConfig);
    });
});

function parseColor(str: string, errorColor: number[]): number[] {
    const res = /^rgba\((.+)\)$/.exec(str.trim());
    if (!res || !res[1]) {
        console.log(`Bad color "${str}", need to be "rgba(255,255,255,1)"`);
        return errorColor;
    }

    const rgba = res[1].split(',').map(Number);
    if (rgba.length !== 4) {
        console.log(`Bad color "${str}", need to be "rgba(255,255,255,1)"`);
        return errorColor;
    }

    if (rgba.some((x) => Number.isNaN(x))) {
        console.log(`Bad color "${str}", need to be "rgba(255,255,255,1)"`);
        return errorColor;
    }

    return rgba;
}
