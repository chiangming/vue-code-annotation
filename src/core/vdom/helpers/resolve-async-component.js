/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'

function ensureCtor(comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  return isObject(comp) ?
    base.extend(comp) :
    comp
}

export function createAsyncPlaceholder(
  factory: Function,
  data: ? VNodeData,
  context : Component,
  children: ? Array < VNode > ,
  tag : ? string
): VNode {
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

export function resolveAsyncComponent(
  factory: Function,
  baseCtor: Class < Component >
): Class < Component > | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  const owner = currentRenderingInstance
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    factory.owners.push(owner)
  }

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (owner && !isDef(factory.owners)) {
    const owners = factory.owners = [owner]
    let sync = true
    let timerLoading = null
    let timerTimeout = null

    ;
    (owner: any).$on('hook:destroyed', () => remove(owners, owner))

    //强制渲染异步加载的组件
    const forceRender = (renderCompleted: boolean) => {
        for (let i = 0, l = owners.length; i < l; i++) {
          (owners[i]: any).$forceUpdate() // $forceUpdate()调用渲染watcher的update
        }

        if (renderCompleted) {
          owners.length = 0
          if (timerLoading !== null) {
            clearTimeout(timerLoading)
            timerLoading = null
          }
          if (timerTimeout !== null) {
            clearTimeout(timerTimeout)
            timerTimeout = null
          }
        }
      }
      // once保证函数只执行一次
      // 当工厂函数异步加载完毕时间调用resovle函数
      // resolve 逻辑最后判断了 sync，显然我们这个场景下 sync 为 false，
      // 那么就会执行 forceRender 函数，它会遍历 factory.contexts，拿到每一个调用异步组件的实例 vm, 
      // 执行 vm.$forceUpdate() 方法
    const resolve = once((res: Object | Class < Component > ) => {
      // cache resolved
      factory.resolved = ensureCtor(res, baseCtor) // 返回异步组件的构造器
        // invoke callbacks only if this is not a synchronous resolve
        // (async resolves are shimmed as synchronous during SSR)
      if (!sync) {
        forceRender(true)
      } else {
        owners.length = 0
      }
    })

    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })

    const res = factory(resolve, reject)

    if (isObject(res)) {
      if (isPromise(res)) {
        // () => Promise
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } else if (isPromise(res.component)) {
        res.component.then(resolve, reject)

        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) {
            factory.loading = true
          } else {
            timerLoading = setTimeout(() => {
              timerLoading = null
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender(false)
              }
            }, res.delay || 200)
          }
        }

        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(() => {
            timerTimeout = null
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production' ?
                `timeout (${res.timeout}ms)` :
                null
              )
            }
          }, res.timeout)
        }
      }
    }

    // 没有异步加载完毕前，js代码顺序执行，sync值为false，return undefine
    sync = false
      // return in case resolved synchronously
    return factory.loading ?
      factory.loadingComp :
      factory.resolved
  }
}