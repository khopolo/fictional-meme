// Process at most two uploaded documents at a time. Durable distributed jobs are separate.
export function createProcessingQueue(concurrency = 2) {
  let running = 0;
  const pending = [];
  function next() {
    while (running < concurrency && pending.length) {
      const { work, resolve, reject } = pending.shift();
      running++;
      Promise.resolve()
        .then(work)
        .then(resolve, reject)
        .finally(() => {
          running--;
          next();
        });
    }
  }
  return (work) =>
    new Promise((resolve, reject) => {
      pending.push({ work, resolve, reject });
      next();
    });
}
