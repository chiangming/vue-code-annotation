/* @flow */
/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks = []
let pending = false

function flushCallbacks() {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
//这里我们有使用微任务的异步延迟包装器。
//在2.5中，我们使用(宏)任务(与微任务结合使用)。
//然而，在重绘之前改变状态会有一些微妙的问题
//(例如:#6813,out-in转换)。另外，在事件处理程序中使用(宏)任务会导致一些奇怪的行为
//这是无法回避的(例如#7109，#7153，#7546，#7834，#8109)。
//因此，我们现在又到处使用微任务了。
//这种折衷的一个主要缺点是，在某些场景中，微任务的优先级太高，
//在假定的连续事件(例如#4521、#6690，它们有工作区)之间甚至在冒泡相同事件(#6566)之间触发。
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:

// nextTick行为利用微任务队列，可以通过任何一个原生Promise访问它，或者MutationObserver。
// MutationObserver有更广泛的支持，但是在iOS >= 9.3.3的UIWebView中，
// 当在触摸事件处理程序中触发时，MutationObserver会出现严重的bug。
// 触发几次之后，它就完全停止工作了。所以，如果原生承诺是可用的，我们将使用它:

/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
      // In problematic UIWebViews, Promise.then doesn't completely break, but
      // it can get stuck in a weird state where callbacks are pushed into the
      // microtask queue but the queue isn't being flushed, until the browser
      // needs to do some other work, e.g. handle a timer. Therefore we can
      // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
    isNative(MutationObserver) ||
    // PhantomJS and iOS 7.x
    MutationObserver.toString() === '[object MutationObserverConstructor]'
  )) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}
/**
 * nextTick是把要执行的任务推入到一个flushSchedulerQueue队列中，在下一个tick同步执行
 * 数据改变后触发渲染watcher的update，但是watcher的flush是在nextTick后，所以渲染是异步的
 * 
 * setter通过watcher触发nextTick(flushSchedulerQueue) 所用到的函数
 * 把传入的回调函数 cb 压入 callbacks 数组，最后一次性地执行 timerFunc （2.5以后默认都是microTask）
 * 而它们都会在下一个 tick 执行 flushCallbacks，flushCallbacks 对 callbacks 遍历，然后执行相应的回调函数。
 * 使用 callbacks 而不是直接在 nextTick 中执行回调函数的原因是保证在同一个 tick 内多次执行 nextTick，不会开启多个异步任务，
 * 而把这些异步任务都压成一个同步任务，在下一个 tick 执行完毕
 * @param {*} cb 使用try catch的方式使用，避免js单线程报错造成整个过程失败
 * @param {*} ctx 
 */
export function nextTick(cb ? : Function, ctx ? : Object) {
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  if (!pending) {
    pending = true
    timerFunc()
  }
  // $flow-disable-line
  // 提供一个 Promise 化的调用，比如：nextTick().then(() => {}) ？？？
  // 当 _resolve 函数执行，就会跳到 then 的逻辑中，执行() => {}
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}