/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving(value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor(value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    def(value, '__ob__', this) // Object.defineProperty(obj, key, {value:this,enumerable:false,writable: true,configurable: true})
      // value.__ob__不会被walk中的for循环枚举
    if (Array.isArray(value)) {
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value) // 遍历数组调用-> observe方法 
    } else {
      this.walk(value) // 遍历对象属性-> 调用defineReactive方法
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk(obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray(items: Array < any > ) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
    /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array < string > ) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
// 给非 VNode 的对象类型数据添加一个 Observer，如果已经添加过value.__ob__则直接返回，
// 否则在满足一定条件下去实例化一个 Observer 对象实例。
/**
 * 
 * 首先实例化 Dep 对象，接着通过执行 def 函数把自身实例添加到数据对象 value 的 __ob__ 属性上
 * new Observer();
 * 
 * 对 value 做判断，对于数组会调用 observeArray 方法，否则对纯对象调用 walk 方法。
 * 可以看到 observeArray 是遍历数组再次调用 observe 方法，
 * 而 walk 方法是遍历对象的 key 调用 defineReactive 方法
 * @param {*} value 
 * @param {*} asRootData 
 */
export function observe(value: any, asRootData: ? boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve && // 默认为true,可以通过toggleObserving方法去改变
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) && // 数组或者可扩展的对象
    Object.isExtensible(value) &&
    !value._isVue // 不是vue实例
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 * 定义一个响应式对象，给对象动态添加 getter 和 setter
 * 
 * defineReactive 函数最开始初始化 Dep 对象的实例，接着拿到 obj 的属性描述符，
 * 然后对子对象递归调用 observe 方法，这样就保证了无论 obj 的结构多复杂，它的所有子属性也能变成响应式的对象，
 * 这样我们访问或修改 obj 中一个嵌套较深的属性，也能触发 getter 和 setter。
 * 最后利用Object.defineProperty去给 obj 的属性 key 添加 getter 和 setter。
 * 
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter ? : ? Function,
  shallow ? : boolean
) {
  const dep = new Dep()

  // 拿到对象属性的定义
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  // 尝试拿到属性原生getter/setter
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    //todo：  !getter || setter应该是 !getter || ！setter？？？
    val = obj[key]
  }

  let childOb = !shallow && observe(val) // 递归观察子对象
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // 响应式getter ，进行依赖收集
    /**
     * 依赖收集全过程
     * 1. init阶段： initState 
     * => initData/Props 
     * => observe()-> new Observer()/defineReactive() 
     * => defineReactive(value) 
     * => Object.defineProperty定义get方法{dep = new Dep();dep.depend()}
     * 
     * 2. mount阶段：vm.$mount(el)
     * => 2.1 mountComponent()定义 updateComponent方法vm._update(vm._render(), hydrating)
     * => 2.2 new 渲染Watcher(updateComponent),updateComponent成为渲染watcher的getter方法
     * => 执行渲染watcher.get()
     * get方法{ 递归过程
     * => pushTarget(渲染watcher)
     * => Dep.target 赋值为当前的渲染 watcher 并压栈targetStack（为了嵌套渲染恢复用）
     * => 渲染watcher.getter() -> 调用updateComponent方法vm._update(vm._render(), hydrating)
     * 
     * 3. mounte阶段的_render阶段：_render 
     * => createElement(value) 
     * => value赋值触发data的（1中定义）get方法
     * => value中dep.depend()
     * => Dep.target.addDep(this)也就是渲染watcher.addDep(this)) （this为value的get中的dep）
     * => dep不在渲染wathcer的.newDeps中？渲染wathcer.newDeps.push(dep) // wathcer中放数据的dep， newDeps 表示新添加的 Dep 实例数组
     * => dep不在渲染wathcer的.deps中？dep.addSub(渲染watcher)// dep 中放订阅数据变化的watcher数组，deps 表示上一次添加的 Dep 实例数组。
     * 
     * => traverse(value)递归去访问 value，触发它所有子项的 getter
     * => popTarget()
     * => cleanupDeps() // 移除对 dep.subs 数组中 Wathcer 的订阅，然后把 newDepIds 和 depIds 交换，newDeps 和 deps 交换，并把 newDepIds 和 newDeps 清空。
     * 递归过程结束}
     */
    get: function reactiveGetter() {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    // 响应式setter，派发更新
    /**
     * 当数据发生变化的时候，触发 setter 逻辑，
     * 把在依赖过程中订阅的的所有观察者，也就是 watcher，都触发它们的 update 过程，
     * 这个过程又利用了队列做了进一步优化，
     * 在 nextTick 后执行所有 watcher 的 run，最后执行它们的回调函数。
     * @param {*} newVal 
     */
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val
        /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal) // shallow 为 false 的情况，会对新设置的值变成一个响应式对象
      dep.notify() // 通知所有的订阅者
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: Array < any > | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array < any > | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray(value: Array < any > ) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}