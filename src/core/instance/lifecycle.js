/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

export function setActiveInstance(vm: Component) {
  const prevActiveInstance = activeInstance
  activeInstance = vm
  return () => {
    activeInstance = prevActiveInstance
  }
}
/**
 * 初始化生命周期的钩子flag标识，vm.$parent，vm.$root，vm.$children，vm.$refs
 * @param {*} vm 组件
 */
export function initLifecycle(vm: Component) {
  const options = vm.$options

  // locate first non-abstract parent
  let parent = options.parent
  if (parent && !options.abstract) {
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    parent.$children.push(vm)
  }

  vm.$parent = parent // 建立父子组件的关系
  vm.$root = parent ? parent.$root : vm

  vm.$children = []
  vm.$refs = {}

  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}

/**
 * beforeCreate ：是拿不到props，methods，data，computed和watch的
 *                主要是用来混入vue-router、vuex等三方组件
 *                在实例化 Vue 的阶段，在 _init 方法中执行的，定义在 src/core/instance/init.js 中
 * created      ：可以拿到props，methods，data，computed和watch 
 *                函数都是在实例化 Vue 的阶段，在 _init 方法中执行的，定义在 src/core/instance/init.js 中
 * beforeMount  ：确保有render函数
 *                在 mount阶段，也就是 DOM 挂载之前，在 mountComponent 函数中执行，定义在 当前lifecycle.js 中
 * Mounted      ：1.表示父子组件全部挂载完毕，
 *                  调用在 当前lifecycle.js 中 
 *                2.表示子组件挂载完毕，
 *                  调用在 定义在 vdom/patch.js的invokeInsertHook函数执行定义在 vdom/create-component.js 中的insert 这个钩子函数 
 * beforeUpdate ：数据渲染之前，数据更新之后执行
 *                在组件已经 mounted 之后（vm._isMounted == true），才会去调用 
 *                在渲染 Watcher 的 before 函数中执行,定义在 当前lifecycle.js 中
 * update       ：在数据重渲染（Virtual DOM re-render and patch）之后执行
 *                在flushSchedulerQueue 函数调用时执行，它的定义在 src/core/observer/scheduler.js 中：
 * beforeDestroy：先父后子执行
 * destroyed    ：先子后父执行，可以做一些定时器的销毁工作
 *                钩子函数的执行时机在组件销毁的阶段，最终会调用 $destroy 方法，它的定义在 当前lifecycle.js 中
 * activated 和 deactivated 钩子函数是专门为 keep-alive 组件定制的钩子
 */
export function lifecycleMixin(Vue: Class < Component > ) {
  /**
   *        _update方法
   *   将VNode渲染成真实DOM
   *   首次渲染时调用，数据更新时调用
   * 核心方法： vm.__patch__
   */
  Vue.prototype._update = function(vnode: VNode, hydrating ? : boolean) {
    const vm: Component = this
    const prevEl = vm.$el
    const prevVnode = vm._vnode
    const restoreActiveInstance = setActiveInstance(vm)
      // vm._vnode :通过 vm._render() 返回的组件渲染 VNode，组件的根vnode
    vm._vnode = vnode
      // Vue.prototype.__patch__ is injected in entry points
      // based on the rendering backend used.
      /**
       * vm.__patch__在不同的平台('src/platforms/')，比如 web 和 weex 上的定义是不一样的   
       * web平台：Vue.prototype.__patch__ = inBrowser ? patch : noop                 
       * 在服务端渲染中，不需要把 VNode 最终转换成 DOM，因此是noop空函数，                   
       * 而在浏览器端渲染中，则是patch 函数(src/platforms/web/runtime/patch.js)          
       * 调用（src/core/vdom/patch.js）下的createPatchFunction函数构造                    
       * patch(oldVnode, vnode, hydrating, removeOnly) {...}                          
       */
    if (!prevVnode) {
      // initial render
      /**
       * patch方法                                                                
       * oldVnode 表示旧的 VNode 节点，它也可以不存在或者是一个 DOM 对象；              
       * vnode 表示执行 _render 后返回的 VNode 的节点；                               
       * hydrating 表示是否是服务端渲染；                                             
       * removeOnly 是给 transition-group 用的                                     
       */
      // 首次渲染的时候
      // vm.$el传入真实dom，<div id="app">对应的dom对象，它赋值是在之前 mountComponent 函数做的
      // vnode为虚拟node，对应的是调用 render 函数的返回值，
      // hydrating 在非服务端渲染情况下为 false
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */ )
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    restoreActiveInstance()
      // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  Vue.prototype.$forceUpdate = function() {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  Vue.prototype.$destroy = function() {
    const vm: Component = this
    if (vm._isBeingDestroyed) {
      return
    }
    // [生命周期：beforeDestroy] 先父后子调用
    callHook(vm, 'beforeDestroy')
    vm._isBeingDestroyed = true
      // remove self from parent
      // 将自身从父组件中移除
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm) // DOM的移除
    }
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
      // invoke destroy hooks on current rendered tree
      // 把子组件递归的销毁
    vm.__patch__(vm._vnode, null)
      // fire destroyed hook
      // [生命周期：destroyed] 先子后父调用
    callHook(vm, 'destroyed')
      // turn off all instance listeners.
    vm.$off()
      // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}
/**
 *  vm.$mount最终执行的方法
 * 
 * new 渲染Watcher
 * -> cb调用 updateComponent方法，
 *      -> 调用 vm._render 方法先生成虚拟 Node，
 *      -> 调用 vm._update 更新 DOM。
 */
export function mountComponent(
  vm: Component,
  el: ? Element,
  hydrating ? : boolean // 是否为服务端渲染，浏览器环境下为false
): Component {
  vm.$el = el
  if (!vm.$options.render) {
    // 没有写render函数的话
    // render就定义成createEmptyVNode方法
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  // [生命周期：beforeMount] 确保有render函数
  callHook(vm, 'beforeMount')

  let updateComponent
    /* istanbul ignore if */
    // 提供性能埋点
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    /**
     * 定义了updateComponent函数 在渲染Watcher中执行
     * 函数执行vm._update方法
     * vm._render()得到渲染的VNode，定义在'./render.js'
     * hydrating与持续渲染相关，实际上为false
     */
    updateComponent = () => {
        vm._update(vm._render(), hydrating)
      }
      // updateComponent方法实际上执行了一次真实的渲染
      // 数据发生变化视图修改时，渲染执行的就是updateComponent方法
      // 首次渲染也是执行的updateComponent方法
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined

  /**
   *  渲染Watcher中执行updateComponent方法
   */
  new Watcher(vm, updateComponent, noop, {
    before() {
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */ )
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook

  // vm.$vnode         表示 Vue 实例的父虚拟 Node
  // vm.$vnode == null 表示当前是根 Vue 的实例
  if (vm.$vnode == null) {
    vm._isMounted = true // 实例已经挂载完毕
    callHook(vm, 'mounted') // [生命周期：mounted] 父组件及所有子组件都挂载完毕
  }
  return vm
}

export function updateChildComponent(
  vm: Component,
  propsData: ? Object,
  listeners : ? Object,
  parentVnode : MountedComponentVNode,
  renderChildren: ? Array < VNode >
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  const needsForceUpdate = !!(
    renderChildren || // has new static slots
    vm.$options._renderChildren || // has old static slots
    hasDynamicScopedSlot
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
      // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree(vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent(vm: Component, direct ? : boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent(vm: Component, direct ? : boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

// callHook 函数根据传入的字符串 hook，去拿到 vm.$options[hook] 对应的回调函数数组，
// 然后遍历执行，执行的时候把 vm 作为函数执行的上下文。
export function callHook(vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}