import { vpFromTargetEyeView } from '@2gis/gl-matrix/mat4';

const worldSize = 2 ** 32;
const tileSizeZpt = 256;
const fov = 60;

export function degToRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(Math.min(value, max), min);
}

export function zoomToHeight(zoom: number, size: Vec2): number {
    return (
        (Math.max(size[1], 1000) * worldSize) /
        (2 * tileSizeZpt * Math.tan(degToRad(fov) / 2) * 2 ** zoom)
    );
}

export interface MapState {
    center: Vec3;
    zoom: number;
    rotation: number;
    pitch: number;
    size: Vec2;
}

export function setEyePosition(out: Vec3, state: MapState): void {
    const { center, rotation, zoom, pitch, size } = state;
    const height = zoomToHeight(zoom, size);
    const offset = Math.max(height * Math.sin(pitch), 1);
    out[0] = center[0] + Math.sin(rotation) * offset;
    out[1] = center[1] - Math.cos(rotation) * offset;
    out[2] = height * Math.cos(pitch);
}

const eye = [0, 0, 0];

export function setVPMatrix(res: Mat4, state: MapState, near: number, far: number): void {
    const { center, size } = state;
    setEyePosition(eye, state);
    const correctedScreenHeight = Math.max(size[1], 1000);
    const view = { x: 0, y: 0, width: size[0], height: size[1] };
    view.y += (correctedScreenHeight - size[1]) / 2;
    const standardizedSize = [size[0], correctedScreenHeight];
    vpFromTargetEyeView(res, fov, near, far, standardizedSize, center, eye, view);
}

export function projectGeoToMap(geoPoint: Vec2): Vec2 {
    const worldHalf = worldSize / 2;
    const sin = Math.sin(degToRad(geoPoint[1]));

    const x = (geoPoint[0] * worldSize) / 360;
    const y = (Math.log((1 + sin) / (1 - sin)) * worldSize) / (4 * Math.PI);

    return [clamp(x, -worldHalf, worldHalf), clamp(y, -worldHalf, worldHalf), 0];
}
