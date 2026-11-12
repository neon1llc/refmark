// A small work pool: runs tasks with an overall concurrency limit and a per-host limit, so a
// manifest full of one site's pages never hammers that site.

// Runs worker(item) for every item and resolves with results in input order.
export function runPool(items, worker, { concurrency = 8, perHost = 2, hostOf = () => '', onDone } = {}) {
  return new Promise((resolve, reject) => {
    const results = new Array(items.length);
    const active = new Map();
    const queue = items.map((item, index) => ({ item, index, host: hostOf(item) }));
    let running = 0;
    let finished = 0;
    if (!items.length) return resolve(results);

    // Starts every queued task that fits under both limits, in queue order
    const pump = () => {
      for (let i = 0; i < queue.length && running < concurrency; ) {
        const task = queue[i];
        if ((active.get(task.host) || 0) >= perHost) {
          i++;
          continue;
        }
        queue.splice(i, 1);
        running++;
        active.set(task.host, (active.get(task.host) || 0) + 1);
        Promise.resolve()
          .then(() => worker(task.item))
          .then((result) => {
            results[task.index] = result;
            finished++;
            onDone?.(result, finished, items.length);
            running--;
            active.set(task.host, active.get(task.host) - 1);
            if (finished === items.length) resolve(results);
            else pump();
          }, reject);
      }
    };
    pump();
  });
}
