/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// 在initData 和initProps中绑定响应式数据
// 通过 /** 把 target[sourceKey][key] 的读写变成了对 target[key] 的读写。
// vm._props（或者_data）.xxx 访问到定义 vm.props(或者data) 中对应的属性
export function proxy(target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
/**
 * 初始化 props，methods，data，computed和watch
 * 响应式对象：
 * observe(data是Object)-> walk(遍历Object的属性) -> defineReactive
 * observe(data是Array) -> observeArray(遍历子元素) -> observe(子元素)
 * observe(非根的props) ->defineReactive(自定义setter =>(wran(警告)))
 */
export function initState(vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
    // data赋值给 vm._data
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */ )
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}
/**
 * props 的初始化主要过程，就是遍历定义的 props 配置。
 * 遍历的过程主要做两件事情：
 * 一个是调用 defineReactive 方法把每个 prop 对应的值变成响应式，
 * 可以通过 vm._props.xxx 访问到定义 props 中对应的属性。
 * 
 * 另一个是通过 proxy 把 vm._props.xxx 的访问代理到 vm.xxx 上
 */
function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
    // cache prop keys so that future props updates can iterate using Array
    // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
    // root instance props should be converted
    // 非根节点的props不被observe
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
      /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

// 初始化data并赋值给vm._data
/** 
 * data 的初始化主要过程也是做两件事，
 * 一个是对定义 data 函数返回对象的遍历，通过 proxy 把每一个值 vm._data.xxx 都代理到 vm.xxx 上；
 * 另一个是调用 observe 方法观测整个 data 的变化，把 data 也变成响应式，
 * 可以通过 vm._data.xxx 访问到定义 data 返回函数中对应的属性
 */
function initData(vm: Component) {
  let data = vm.$options.data
    // 判断data定义时是data(){ reuturn {}} 还是data：{}
  data = vm._data = typeof data === 'function' ?
    getData(data, vm) :
    data || {}
    // 判断返回的data是否是一个对象
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance 
  // 确保vm绑定的data、props、methods中的属性名不重名
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  // 对data数据做响应式处理
  // 给非 VNode 的对象类型数据添加一个 Observer，如果已经添加过则直接返回，
  // 否则在满足一定条件下去实例化一个 Observer 对象实例。
  // 它的作用是给对象的属性添加 getter 和 setter，用于依赖收集和派发更新
  observe(data, true /* asRootData */ )
}

export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }
  /**
   * => 创建 vm._computedWatchers 为一个空对象Object.create(null)，
   * => 对computed 对象做遍历，拿到计算属性的每一个 userDef，
   * => 获取这个 userDef 对应的 getter 函数，拿不到则在开发环境下报警告。
   * => 为每一个 getter 创建一个 computed watcher，
   * => 调用 defineComputed(vm, key, userDef)，
   * 
   * 判断计算属性对于的 key 是否已经被 data 或者 prop 所占用，如果是的话则在开发环境报相应的警告。
   * @param {*} vm 
   * @param {*} computed 
   */
function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
    // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // 创建的computed watcher
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.

    //组件定义的计算属性已在组件原型。我们只需要在实例化的时候定义已定义的计算属性
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}
/**
 * 通过Object.defineProperty 给计算属性对应的 key 值添加 getter 和 setter，
 * setter 通常是计算属性是一个对象，并且拥有 set 方法的时候才有，否则是一个空函数。
 * @param {*} target 
 * @param {*} key 
 * @param {*} userDef Computed方法或者带get/set属性的对象
 */
export function defineComputed(
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache ?
      createComputedGetter(key) :
      createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get ?
      shouldCache && userDef.cache !== false ?
      createComputedGetter(key) :
      createGetterInvoker(userDef.get) :
      noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
    sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function() {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
/**
 * => watcher.dirty根据options初始化为true
 * => watcher.get() & watcher.dirty =false => =>Dep.target =这个computed watcher
 * => get方法执行computed中定义的get函数
 * => 依赖的响应式data的获取触发data的getter => data持有的dep 添加到Dep.target也就是computer watcher中 
 * => 依赖的响应式data的赋值触发data的setter => data.dep.notify() => watcher.update() 方法`if (this.lazy) {this.dirty = true}`
 *    => 下次再访问这个计算属性的时候才会重新求值。
 * 
 *  例如：computed: { fullName: function () {return this.firstName + ' ' + this.lastName}}
 *  这里的getter函数执行了执行了 return this.firstName + ' ' + this.lastName
 *  而this.firstName和this.lastName是响应式对象，获取值会触发它们的 getter，
 * @param {*} key 
 */
function createComputedGetter(key) {
  // computed属性的get方法
  return function computedGetter() {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate() //即 watcher.get() & watcher.dirty =false
      }
      if (Dep.target) { // 这时候的 Dep.target 是渲染 watcher
        watcher.depend() // 渲染 watcher 订阅了这个 computed watcher 的变化。
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this)
  }
}

function initMethods(vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}
/**
 * => 对 watch 对象做遍历，拿到每一个 handler,
 * => 调用 createWatcher 方法，
 *    => hanlder 的类型做判断，拿到它最终的回调函数
 *    => vm.$watch(expOrFn, handler, options)
 *    => 执行 const watcher = new Watcher(vm, expOrFn, cb, options) 实例化了一个 user watcher
 *    => new Watcher(vm, expOrFn, cb, options) // options.user=true 创建的用户watcher
 *    => data的setter => data.dep.notify() => watcher.update() 方法 => ...=> watcher.run()
 *    
 * @param {*} vm 
 * @param {*} watch 
 */
function initWatch(vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) { //  Vue 是支持 watch 的同一个 key 对应多个 handler
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher(
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options ? : Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin(Vue: Class < Component > ) {
  // flow somehow has problems with directly declared definition object
  // when using /**, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function() { return this._data }
  const propsDef = {}
  propsDef.get = function() { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function() {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function() {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function(
    expOrFn: string | Function,
    cb: any,
    options ? : Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    return function unwatchFn() {
      watcher.teardown()
    }
  }
}