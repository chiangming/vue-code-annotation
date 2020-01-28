/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

/***************************************
 * Vue.component(tagName, options)
 * 全局组件注册
 * 1. initAssetRegisters方法
 *        将this.options.components通过Vue.extend()方式继承Vue，将定义的方法转换成构造器
 * 2. render阶段 _createElement方法生成vnode
 *        判断isDef(Ctor = resolveAsset(context.$options, 'components', tag)
 *        -> resolveAsset 尝试以id、驼峰id、首字母大写id的顺序去获取components对应的构造函数
 *        -> vnode = createComponent(Ctor, data, context, children, tag)
 ***************************************/
export function initAssetRegisters(Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */

  //ASSET_TYPES = ['component','directive','filter']
  // Vue.component = function(id=tagName,definition=options){……}
  // 其中definition经过vue-loader其属性上添加了render函数和其他钩子函数
  ASSET_TYPES.forEach(type => {
    Vue[type] = function(
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        if (type === 'component' && isPlainObject(definition)) {
          definition.name = definition.name || id
            // 把definition这个对象转换成一个继承于 Vue 的构造函数
          definition = this.options._base.extend(definition)
            // 相当于 Vue.extend
            // Sub.options.components 合并到 vm.$options.components 上。
        }
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        // 把definition 挂载到 Vue.options.components
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}