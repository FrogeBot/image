class Queue {
  constructor() {
    this.queue = [];
    this.pendingPromise = false;
  }

  enqueue = function(promise, onPositionUpdated) {
    return new Promise((resolve, reject) => {
        this.queue.push({
            promise,
            resolve,
            reject,
            onPositionUpdated
        });
        if(onPositionUpdated) onPositionUpdated(this.workingOnPromise ? this.queue.length : this.queue.length - 1, this.queue.length-1)
        this.dequeue();
    });
  }

  dequeue = function() {
    this.queue.forEach((queued, idx) => {
      if(queued.onPositionUpdated) queued.onPositionUpdated(idx, this.queue.length-1)
    });

    if (this.workingOnPromise) {
      return false;
    }

    const item = this.queue[0];
    if (!item) {
      return false;
    }
    
    try {
      this.workingOnPromise = true;
      setTimeout(() => {
        item.promise()
          .then((value) => {
            this.workingOnPromise = false;
            item.resolve(value);
            this.queue.shift();
            this.dequeue();
          })
          .catch(err => {
            this.workingOnPromise = false;
            item.reject(err);
            this.queue.shift();
            this.dequeue();
          })
        }, 2500)
    } catch (err) {
      this.workingOnPromise = false;
      item.reject(err);
      this.queue.shift();
      this.dequeue();
    }
    return true;
  }
}

module.exports = Queue