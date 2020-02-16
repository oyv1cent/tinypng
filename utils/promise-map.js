module.exports = Promise.map = map;

function map(arr, fn, concurrency) {

  concurrency = concurrency || 1;

  return new Promise(function(resolve, reject) {

    let completed = 0;
    let started = 0;
    let running = 0;
    let results = new Array(arr.length);

    (function replenish() {
      if (completed >= arr.length) {
        return resolve(results);
      };

      while (running < concurrency && started < arr.length) {
        running++;
        started++;

        var index = started - 1;
        fn.call(arr[index], arr[index], index) // item,index
          .then(() => {
            running--;
            completed++;
            results[index] = arr[index];

            replenish();
          })
          .catch((reject));
      }
    })();
  });
}
