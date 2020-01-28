/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin(Vue: Class < Component > ) {
  Vue.prototype._init = function(options ? : Object) {
    const vm: Component = this
      // a uid
    vm._uid = uid++ // 定义_uid

      let startTag, endTag
        /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
      // merge options    // 把传入的option 合并到vm.$options上
      /**
       *  子组件构造器调用_init方法时  
       */

    // 配置合并
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      // 组件配置合并
      initInternalComponent(vm, options)
    } else {
      // 外部调用下的配置合并
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor), // 返回vm.constructor.options，相当于 Vue.options 在initGlobalAPI(Vue)中定义
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm) //vm._renderProxy在开发环境下为Proxy对象
    } else {
      vm._renderProxy = vm //vm._renderProxy在生产环境下即为vm 
    }
    // expose real self
    vm._self = vm
    initLifecycle(vm)
    initEvents(vm)
    initRender(vm)

    // [生命周期：beforeCreate] 是拿不到props，methods，data，computed和watch的
    // 主要是用来混入vue-router、vuex等三方组件
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    initState(vm) // 初始化 props，methods，data，computed和watch
    initProvide(vm) // resolve provide after data/props

    // [生命周期：created] 可以拿到props，methods，data，computed和watch
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) { // 判断是否绑定el
      vm.$mount(vm.$options.el) // el通过$mount转换为dom对象
        // 最终执行lifecycle.js中的mountComponent方法
        // [生命周期：beforeMount] 确保有render函数
        // 
    }
  }
}
/**
 *       组件局部注册
 *  export default { components: { HelloWorld } }
 *  1. 局部注册组件的option放在子组件实例vm.$options
 * 2. render阶段 _createElement方法生成局部注册组件vnode
 *        判断isDef(Ctor = resolveAsset(局部注册组件vm.$options, 'components', tag)
 *        -> resolveAsset 尝试以id、驼峰id、首字母大写id的顺序去获取局部注册components对应的构造函数Ctor
 *        -> vnode = createComponent(Ctor, data, context, children, tag)
 */
export function initInternalComponent(vm: Component, options: InternalComponentOptions) {
  // vm.constructor 就是子组件的构造函数 Sub
  // 这里相当于将局部注册组件的option放在局部组件实例vm.$options
  const opts = vm.$options = Object.create(vm.constructor.options)
    // doing this because it's faster than dynamic enumeration.
    // 将（./create-components.js的）createComponentInstanceForVnode 函数传入的几个参数合并到内部的选项 $options 里了。
  const parentVnode = options._parentVnode
  opts.parent = options.parent // 当前vm实例
  opts._parentVnode = parentVnode // 占位符vnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions(Ctor: Class < Component > ) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
        // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
        // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions(Ctor: Class < Component > ): ? Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}