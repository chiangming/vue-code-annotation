/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

export function initRender(vm: Component) {
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options
  const parentVnode = vm.$vnode = options._parentVnode // the placeholder node in parent tree
  const renderContext = parentVnode && parentVnode.context
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = emptyObject
    // bind the createElement fn to this instance
    // so that we get proper render context inside it.
    // args order: tag, data, children, normalizationType, alwaysNormalize
    // internal version is used by render functions compiled from templates
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false) //编译生产
    // normalization is always applied for the public version, used in
    // user-written render functions.
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true) //用户手写

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}

export let currentRenderingInstance: Component | null = null

// for testing only
export function setCurrentRenderingInstance(vm: Component) {
  currentRenderingInstance = vm
}

export function renderMixin(Vue: Class < Component > ) {
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  Vue.prototype.$nextTick = function(fn: Function) {
    return nextTick(fn, this)
  }

  // vm._render
  // 通过执行createElement方法返回虚拟Node vnode
  Vue.prototype._render = function(): VNode {
    const vm: Component = this
      //render函数：自己写的或者从template（el）编译生成的，
      //           在$mount过程中合并到vm.$options中
    const { render, _parentVnode } = vm.$options
      // 此处的_parentVnode是在create-component.js下的createComponentInstanceForVnode方法中设置的
    if (_parentVnode) {
      vm.$scopedSlots = normalizeScopedSlots(
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      )
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    vm.$vnode = _parentVnode // 当前组件vm的父 VNode
      // render self
    let vnode
    try {
      // There's no need to maintain a stack because all render fns are called
      // separately from one another. Nested component's render fns are called
      // when parent component is patched.
      currentRenderingInstance = vm
        /*************************************************
         *  手写的render函数的第一个参数即是createElement方法 *
         *  例如：                                        *
         *  render: function (createElement) {           *
         *    return createElement('div', {              *
         *       attrs: {                                *
         *          id: 'app'                            *
         *        },                                     *
         *    }, this.message)                           *
         *  }                                            *
         *                                               *
         * 相当于template编译的                            *
         * <div id="app">                                *
         *   {{ message }}                               *
         * </div>                                        *
         *************************************************/
        // vm._renderProxy在initMixin中定义
        // 在生产环境下即为vm,
        // 在开发环境下为ES6的Proxy对象，访问数据的对其劫持，对发生的错误处理错误信息
      vnode = render.call(vm._renderProxy, vm.$createElement)
        // initRender方法中定义 vm.$createElement = 
        // (a, b, c, d) => createElement(vm, a, b, c, d, true)
    } catch (e) {
      handleError(e, vm, `render`)
        // return error render result,
        // or previous vnode to prevent render error causing blank component
        /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production' && vm.$options.renderError) {
        try {
          vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
        } catch (e) {
          handleError(e, vm, `renderError`)
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    } finally {
      currentRenderingInstance = null
    }
    // if the returned array contains only a single node, allow it
    if (Array.isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0]
    }
    // 多个根节点造成的VNode数组
    // return empty vnode in case the render function errored out
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      vnode = createEmptyVNode()
    }
    // set parent
    vnode.parent = _parentVnode
    return vnode
  }
}