module.exports = Promise.map = map;

function map(arr, fn, concurrency) {

  concurrency = concurrency || 1;

  return new Promise(function(resolve, reject) {

    var completed = 0;
    var started = 0;
    var running = 0;
    var results = new Array(arr.length);

    (function replenish() {
      if (completed >= arr.length) {
        return resolve(results);
      };

      while (running < concurrency && started < arr.length) {
        running++;
        started++;

        var index = started - 1;
        fn.call(arr[index], arr[index], index) // item,index
          .then(function(result) {
            // console.log('done');
            running--;
            completed++;
            results[index] = result;

            replenish();
          })
          .catch(reject);
      }
    })();
  });
}