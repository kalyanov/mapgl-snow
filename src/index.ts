import ShaderProgram from '2gl/ShaderProgram';
import BufferChannel from '2gl/BufferChannel';
import Shader from '2gl/Shader';
import Buffer from '2gl/Buffer';
import Vao from '2gl/Vao';
import * as mat4 from '@2gis/gl-matrix/mat4';
import * as vec3 from '@2gis/gl-matrix/vec3';
import type { Map } from '@2gis/mapgl/types';
import { vertexShaderSource, fragmentShaderSource } from './shaders';
import {
    degToRad,
    MapState,
    projectGeoToMap,
    setEyePosition,
    setVPMatrix,
    zoomToHeight,
} from './utils';

const maxParticleNumber = 100000;

/**
 * Fake zoom in which the camera moves, read more in Snow#update
 */
const snowFakeZoom = 19;

const random = (() => {
    let seed = 15;
    return () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };
})();

function randBetween(min: number, max: number): number {
    return Math.round(min + (max - min) * random());
}

// Temporary vectors that are using in Snow#update
const eye = [0, 0, 0];
const delta = [0, 0, 0];

/**
 * Analog of `mod` in GLSL, it's important that the function isn't equal to `%` from JS
 */
const mod = (x: number, y: number) => x - y * Math.floor(x / y);

export interface SnowOptions {
    dispersion: number;
    particleNumber: number;
    velocityX: number;
    velocityY: number;
    velocityZ: number;
    size: number;
    color: number[];
    minZoom: number;
}

export interface SnowInitializeOptions {
    skipWaitingForMapIdle: boolean;
}

export class Snow {
    private options: SnowOptions = {
        dispersion: 50,
        velocityX: 0,
        velocityY: 0,
        velocityZ: 500,
        particleNumber: 50000,
        size: 6,
        color: [255, 255, 255, 0.7],
        minZoom: 9,
    };
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;
    private ext: { OES_vertex_array_object: OES_vertex_array_object | null };
    private projectionMatrix: Float32Array;
    private program: ShaderProgram;
    private vao?: Vao;
    private buffer?: Buffer;
    private startTime: number;
    private changeSnowTime: number;
    private prevCenter: number[];
    private snowCenter: number[];
    private mapInited: boolean;
    private beforeInitedOptions: Partial<SnowOptions>;
    private snowLocalCenter: number[];

    constructor(private map: Map, initializeOptions?: SnowInitializeOptions) {
        this.canvas = document.createElement('canvas') as HTMLCanvasElement;
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = '0';
        this.canvas.style.top = '0';
        this.canvas.style.pointerEvents = 'none';

        // TODO: change to public method
        (map as any)._impl.getContainer().appendChild(this.canvas);

        const size = map.getSize();
        this.setSize(size[0], size[1]);
        map.on('resize', () => {
            const size = map.getSize();
            this.setSize(size[0], size[1]);
        });

        const gl = (this.gl = this.canvas.getContext('webgl', {
            antialias: false,
            premultipliedAlpha: false,
            alpha: true,
        }) as WebGLRenderingContext);
        this.ext = {
            OES_vertex_array_object: gl.getExtension('OES_vertex_array_object'),
        };

        gl.clearColor(1, 1, 1, 0);
        gl.enable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        this.projectionMatrix = new Float32Array(mat4.create());

        const center = projectGeoToMap(map.getCenter());
        this.prevCenter = center.slice();
        this.snowCenter = center.slice();
        this.snowLocalCenter = [0, 0, 0];

        this.program = new ShaderProgram({
            vertex: new Shader('vertex', vertexShaderSource),
            fragment: new Shader('fragment', fragmentShaderSource),
            attributes: [
                { name: 'a_position', location: 0 },
                { name: 'a_velocity', location: 1 },
            ],
            uniforms: [
                { name: 'u_projectionMatrix', type: 'mat4' },
                { name: 'u_time', type: '1f' },
                { name: 'u_size', type: '1f' },
                { name: 'u_eye', type: '3fv' },
                { name: 'u_flake_size', type: '1f' },
                { name: 'u_color', type: '4fv' },
                { name: 'u_common_velocity', type: '3fv' },
                { name: 'u_local_center', type: '3fv' },
                { name: 'u_start_time', type: '1f' },
            ],
        });

        this.changeSnowTime = this.startTime = Date.now();
        this.beforeInitedOptions = {};

        if (initializeOptions && initializeOptions.skipWaitingForMapIdle) {
            this.mapInited = true;
            this.setOptions(this.beforeInitedOptions);
        } else {
            this.mapInited = false;
            map.once('idle', () => {
                this.mapInited = true;
                this.setOptions(this.beforeInitedOptions);
            });
        }

        requestAnimationFrame(this.update);
    }

    public setOptions(options: Partial<SnowOptions>) {
        if (!this.mapInited) {
            this.beforeInitedOptions = options;
            return;
        }

        const needInitBufer = options.dispersion !== this.options.dispersion;

        const now = Date.now();
        const delta = (now - this.changeSnowTime) / 1000;
        this.changeSnowTime = now;
        this.snowLocalCenter[0] += this.options.velocityX * delta;
        this.snowLocalCenter[1] += this.options.velocityY * delta;
        this.snowLocalCenter[2] -= this.options.velocityZ * delta;

        this.options = {
            ...this.options,
            ...options,
        };

        if (needInitBufer) {
            this.initBuffer();
        }
    }

    private update = () => {
        requestAnimationFrame(this.update);

        const gl = this.gl;
        const pixelRatio = window.devicePixelRatio;

        const center = projectGeoToMap(this.map.getCenter());
        const zoom = this.map.getZoom();
        const rotation = degToRad(this.map.getRotation());
        const pitch = degToRad(this.map.getPitch());
        const size = this.map.getSize();

        const snowCubeSize = zoomToHeight(snowFakeZoom, this.map.getSize());

        /**
         * Moving the center of the snow like it is happening between `snowFakeZoom` and `snowFakeZoom + 1`.
         * It needed to prevent snow blinking while the map is moving at low zoom.
         */
        const boundZoom = snowFakeZoom + mod(zoom - snowFakeZoom, 1);
        const scale = 2 ** (zoom - boundZoom);

        vec3.sub(delta, center, this.prevCenter);
        vec3.copy(this.prevCenter, center);

        vec3.scale(delta, delta, scale);
        this.snowCenter[0] = (this.snowCenter[0] + delta[0]) % snowCubeSize;
        this.snowCenter[1] = (this.snowCenter[1] + delta[1]) % snowCubeSize;

        gl.viewport(0, 0, size[0] * pixelRatio, size[1] * pixelRatio);

        gl.clear(gl.COLOR_BUFFER_BIT);

        let flakeSize = this.options.size;

        // Gradually decrease the size of snowflakes, when come to the minimum zoom
        if (zoom < this.options.minZoom + 1) {
            flakeSize -= flakeSize * (this.options.minZoom + 1 - zoom);
        }

        if (zoom > this.options.minZoom && this.vao && this.options.particleNumber > 0) {
            const snowState: MapState = {
                center: this.snowCenter,
                zoom: boundZoom,
                rotation,
                size,
                pitch,
            };

            setVPMatrix(this.projectionMatrix, snowState, 10, 100 * 500);
            setEyePosition(eye, snowState);

            const [r, g, b, a] = this.options.color;

            const now = Date.now();
            this.program.enable(gl);

            this.program.bind(gl, {
                u_size: snowCubeSize,
                u_flake_size: flakeSize * pixelRatio,
                u_color: [r / 255, g / 255, b / 255, a],
                u_eye: eye,
                u_projectionMatrix: this.projectionMatrix,
                u_time: (now - this.changeSnowTime) / 1000,
                u_start_time: (now - this.startTime) / 1000,
                u_common_velocity: [
                    this.options.velocityX,
                    this.options.velocityY,
                    -this.options.velocityZ,
                ],
                u_local_center: this.snowLocalCenter,
            });

            this.vao.bind({
                gl,
                extensions: this.ext,
            });

            gl.drawArrays(gl.POINTS, 0, Math.min(this.options.particleNumber, maxParticleNumber));
        }
    };

    private setSize(width: number, height: number) {
        const pixelRatio = window.devicePixelRatio;
        this.canvas.width = width * pixelRatio;
        this.canvas.height = height * pixelRatio;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
    }

    private initBuffer() {
        if (this.vao) {
            this.vao.remove();
        }
        if (this.buffer) {
            this.buffer.remove();
        }

        const data = {
            array: new Float32Array(maxParticleNumber * 6),
            index: 0,
        };

        for (let i = 0; i < maxParticleNumber; i++) {
            this.createFlake(data);
        }

        const stride = 6 * 4;
        let offset = 0;

        this.buffer = new Buffer(data.array);

        const positionBuffer = new BufferChannel(this.buffer, {
            itemSize: 3,
            dataType: Buffer.Float,
            stride,
            offset,
        });
        offset += 3 * 4;

        const velocityBuffer = new BufferChannel(this.buffer, {
            itemSize: 3,
            dataType: Buffer.Float,
            stride,
            offset,
        });
        offset += 3 * 4;

        this.vao = new Vao(this.program, {
            a_position: positionBuffer,
            a_velocity: velocityBuffer,
        });
    }

    private createFlake(buffer: { array: Float32Array; index: number }) {
        const snowCubeSize = zoomToHeight(snowFakeZoom, this.map.getSize());
        const { dispersion } = this.options;

        const position = [
            randBetween(-snowCubeSize, snowCubeSize),
            randBetween(-snowCubeSize, snowCubeSize),

            // The height of the snow cube is 2 times more than its width and height
            randBetween(-snowCubeSize, 0),
        ];

        const velocity = [
            randBetween(-dispersion, dispersion),
            randBetween(-dispersion, dispersion),
            randBetween(-dispersion, dispersion),
        ];

        buffer.array[buffer.index++] = position[0];
        buffer.array[buffer.index++] = position[1];
        buffer.array[buffer.index++] = position[2];
        buffer.array[buffer.index++] = velocity[0];
        buffer.array[buffer.index++] = velocity[1];
        buffer.array[buffer.index++] = velocity[2];
    }
}
