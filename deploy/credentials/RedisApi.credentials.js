"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisApi = void 0;
class RedisApi {
    constructor() {
        this.name = 'redisApi';
        this.displayName = 'Redis';
        this.properties = [
            {
                displayName: 'Host',
                name: 'host',
                type: 'string',
                default: 'localhost',
                required: true,
            },
            {
                displayName: 'Port',
                name: 'port',
                type: 'number',
                default: 6379,
                required: true,
            },
            {
                displayName: 'Password',
                name: 'password',
                type: 'string',
                typeOptions: { password: true },
                default: '',
            },
            {
                displayName: 'DB',
                name: 'db',
                type: 'number',
                default: 0,
                description: 'Optional logical database index to select'
            }
        ];
    }
}
exports.RedisApi = RedisApi;
