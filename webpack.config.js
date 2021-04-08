const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const path = require('path');

module.exports = (env) => {
    const mode = env.production ? 'production' : 'development';

    const library = {
        mode,

        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'ts-loader',
                        options: {
                            transpileOnly: true,
                        },
                    },
                },
            ],
        },

        resolve: {
            extensions: ['.ts', '.js'],
        },

        entry: './src/index.ts',

        output: {
            library: 'mapglSnow',
            libraryTarget: 'umd',
            filename: 'snow.js',
            path: path.resolve(__dirname, 'dist'),
            publicPath: '/dist',
        },

        plugins: [new ForkTsCheckerWebpackPlugin()],

        devtool: mode === 'production' ? false : 'source-map',

        devServer: {
            host: '0.0.0.0',
            port: 3000,
            stats: {
                modules: false,
            },
            disableHostCheck: true,
            publicPath: '/dist',
        },
    };

    const demo = {
        ...library,
        entry: './demo/index.ts',
        output: {
            filename: 'demo.js',
            path: path.resolve(__dirname, 'dist'),
            publicPath: '/dist',
        },
    };

    if (env.demo) {
        return demo;
    }

    return library;
};
