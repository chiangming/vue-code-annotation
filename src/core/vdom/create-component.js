/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch

// hook包括了init，prepatch，insert，destroy
// 此处activeInstance为当前激活的vm实例
// vm.$vnode为组件占位vnode
// vm._vnode为组件的render渲染vnode
const componentVNodeHooks = {
  init(vnode: VNodeWithData, hydrating: boolean): ? boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      // 非keep-alive组件 
      // 创建一个 Vue 的实例，然后调用 $mount 方法挂载子组件
      // 子组件实例化即在此处进行的createComponentInstanceForVnode调用的Vue.prototype._init方法
      // 以此来确定vm.$parent建立父子组件的实例关系
      const child = vnode.componentInstance = createComponentInstanceForVnode(
          vnode,
          activeInstance
        )
        // 最终会调用 mountComponent 方法，进而执行 children的vm._render() 方法
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  prepatch(oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },
  // 每个子组件都是在这个钩子函数中执行 mounted 钩子函数，
  // insertedVnodeQueue 的添加顺序是先子后父，
  // 所以对于同步渲染的子组件而言，mounted 钩子函数的执行顺序也是先子后父。
  insert(vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted') // [生命周期:mounted] 子组件完成挂载
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */ )
      }
    }
  },

  destroy(vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        deactivateChildComponent(componentInstance, true /* direct */ )
      }
    }
  }
}

const hooksToMerge = Object.keys(componentVNodeHooks)

/***************************************
 *       render阶段的createComponent    *
 *      返回的组件vnode                  *
 ***************************************/
export function createComponent(
  Ctor: Class < Component > | Function | Object | void,
  data: ? VNodeData,
  context : Component,
  children: ? Array < VNode > ,
  tag ? : string
): VNode | Array < VNode > | void {
    if (isUndef(Ctor)) {
      return
    }

    // 'gloabal-api/index.js'中  Vue.options._base = Vue，
    // 并在'instance/init'中合并到$options
    const baseCtor = context.$options._base //实际上就是Vue
      /**************************
       *      1.构造子类构造器    *
       **************************/
      // plain options object: turn it into a constructor
    if (isObject(Ctor)) {
      // 通过原型继承extend返回子类构造器
      Ctor = baseCtor.extend(Ctor)
    }

    // if at this stage it's not a constructor or an async component factory,
    // reject.
    if (typeof Ctor !== 'function') {
      if (process.env.NODE_ENV !== 'production') {
        warn(`Invalid Component definition: ${String(Ctor)}`, context)
      }
      return
    }

    // async component

    // 异步组件的创建
    let asyncFactory
    if (isUndef(Ctor.cid)) { // 异步组件还没有生成构造函数，只有工厂函数，也就没有cid
      asyncFactory = Ctor
      Ctor = resolveAsyncComponent(asyncFactory, baseCtor)
      if (Ctor === undefined) {
        // return a placeholder node for async component, which is rendered
        // as a comment node but preserves all the raw information for the node.
        // the information will be used for async server-rendering and hydration.

        // 先返回一个空的注释节点
        return createAsyncPlaceholder(
          asyncFactory,
          data,
          context,
          children,
          tag
        )
      }
    }

    data = data || {}

    // resolve constructor options in case global mixins are applied after
    // component constructor creation
    resolveConstructorOptions(Ctor)

    // transform component v-model data into props & events
    if (isDef(data.model)) {
      transformModel(Ctor.options, data)
    }

    // extract props
    const propsData = extractPropsFromVNodeData(data, Ctor, tag)

    // functional component
    if (isTrue(Ctor.options.functional)) {
      return createFunctionalComponent(Ctor, propsData, data, context, children)
    }

    // extract listeners, since these needs to be treated as
    // child component listeners instead of DOM listeners
    const listeners = data.on
      // replace with listeners with .native modifier
      // so it gets processed during parent component patch.
    data.on = data.nativeOn

    if (isTrue(Ctor.options.abstract)) {
      // abstract components do not keep anything
      // other than props & listeners & slot

      // work around flow
      const slot = data.slot
      data = {}
      if (slot) {
        data.slot = slot
      }
    }

    // install component management hooks onto the placeholder node
    /***********************
     *  2. 安装组件钩子函数   *
     ***********************/
    installComponentHooks(data)

    // return a placeholder vnode
    const name = Ctor.options.name || tag

    /************************
     * 3. 实例化 VNode       *
     ************************/
    // 组件vnode的children为空，text为空，element为空，
    const vnode = new VNode(
        `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },  // vnode的componentOptions包含了children
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

export function createComponentInstanceForVnode (
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // 当前vm实例 // activeInstance in lifecycle state
): Component {
  // 构造一个内部组件的参数
  const options: InternalComponentOptions = {
    _isComponent: true,// true 表示它是一个组
    _parentVnode: vnode,// 占位符vnode
    parent// 表示当前激活的组件实例
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // vnode.componentOptions.Ctor 对应的就是子组件的构造函数，
  // 它实际上是继承于 Vue 的一个构造器 Sub，（global-api/extend）
  // 相当于 new Sub(options) 在构造函数中执行了子组件的this._init方法
  return new vnode.componentOptions.Ctor(options)
}

function installComponentHooks (data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]// hook包括了init，prepatch，insert，destroy
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  const existing = on[event]
  const callback = data.model.callback
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing)
    }
  } else {
    on[event] = callback
  }
}