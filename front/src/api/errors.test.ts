import {
  ApiError,
  createHttpError,
  createNetworkError,
  createTimeoutError,
} from './errors';

describe('ApiError', () => {
  it('按 HTTP 状态分类 FastAPI 错误', () => {
    const error = createHttpError(422, {
      detail: [
        { loc: ['body', 'name'], msg: '字段不能为空', type: 'value_error' },
      ],
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.category).toBe('validation');
    expect(error.status).toBe(422);
    expect(error.message).toContain('字段不能为空');
    expect(error.isRetryable).toBe(false);
  });

  it('保留业务冲突代码和 detail', () => {
    const detail = { code: 'DATASET_IN_USE', message: '数据集仍被任务引用' };
    const error = createHttpError(409, { detail });

    expect(error.category).toBe('business');
    expect(error.code).toBe('DATASET_IN_USE');
    expect(error.detail).toEqual(detail);
    expect(error.message).toBe('数据集仍被任务引用');
  });

  it('区分网络错误和请求超时', () => {
    expect(createNetworkError(new TypeError('Failed to fetch')).category).toBe('network');
    expect(createTimeoutError(30_000).category).toBe('timeout');
  });
});
