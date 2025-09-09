import { RedisPublish } from '../../nodes/RedisPublish.node';
import { makeExecuteStub } from '../helpers/n8nStubs';

const publishMock = jest.fn(() => Promise.resolve(1));
const disconnectMock = jest.fn(() => Promise.resolve());
const quitMock = jest.fn(() => Promise.resolve());

jest.mock('ioredis', () => {
  return jest.fn(function() {
    return {
      publish: publishMock,
      disconnect: disconnectMock,
      quit: quitMock,
      on: jest.fn()
    };
  });
});

describe('RedisPublish node', () => {
  it('publishes message to configured channel', async () => {
    const node = new RedisPublish();
    const thisArg = makeExecuteStub({
      params: { channel: 'events', messageField: 'message' },
      items: [{ json: { message: { type: 'update', id: 1 } } }],
      credentials: { redisApi: { host: 'localhost', port: 6379 } },
    });
    const out = await node.execute.call(thisArg);
    expect(out[0][0].json).toEqual({ message: { type: 'update', id: 1 } });
    expect(publishMock).toHaveBeenCalledWith('events', JSON.stringify({ type: 'update', id: 1 }));
    expect(quitMock).toHaveBeenCalled();
  });
});

