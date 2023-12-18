export const vertexShaderSource = `
    attribute vec3 a_position;
    attribute vec3 a_velocity;

    uniform mat4 u_projectionMatrix;
    uniform float u_time;
    uniform float u_start_time;
    uniform float u_size;
    uniform float u_flake_size;
    uniform vec3 u_eye;
    uniform vec3 u_common_velocity;
    uniform vec3 u_local_center;

    void main() {
        // Sinusoidal offset of a snowflake in time.
        // a_velocity.x is just a random component in the sinus calculating,
        // it allows to move flakes with diffrent offset in period.
        vec3 shift = sin(u_start_time + a_velocity.x) * a_velocity;

        vec3 pos = u_local_center + a_position + u_common_velocity * u_time + shift;

        vec3 min = u_eye - u_size / 2.0;
        vec3 position = min + mod(pos - min, u_size);

        gl_Position = u_projectionMatrix * vec4(position, 1.0);

        float scale = u_size / max(length(position - u_eye), 0.001);
        gl_PointSize = u_flake_size * scale / 5.0;
    }
`;

export const fragmentShaderSource = `
    precision mediump float;
    uniform vec4 u_color;

    void main() {
        float dist = distance(gl_PointCoord, vec2(0.5));
        float alpha = 1.0 - smoothstep(0.25, 0.5, dist);
        gl_FragColor = vec4(u_color.rgb, u_color.a * alpha);
    }
`;
