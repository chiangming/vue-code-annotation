/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
    const el = query(id)
    return el && el.innerHTML
  })
  // 缓存'./runtime/index'的Vue原型上的mount方法
  // 最终执行mountComponent方法
const mount = Vue.prototype.$mount

/********************************
 *             $mount           *
 ********************************/
Vue.prototype.$mount = function(
  el ? : string | Element,
  hydrating ? : boolean
): Component {
  el = el && query(el) // 字符串的el执行document.querySelector(el), dom对象的el直接返回

  /* istanbul ignore if */
  // 禁止挂载在body和html上
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
    // resolve template/el and convert to render function
    // 判断是否定义了render函数
    // 如果有render函数，就直接执行render函数
    // 否则根据template或者el生成的template去生成render函数
  if (!options.render) {
    let template = options.template
      // 如果定义了template
    if (template) {
      if (typeof template === 'string') { // 如果是一个dom对象
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
            /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) { // 如果是一个dom对象
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
      // 没有定义template但是定义了el
    } else if (el) {
      template = getOuterHTML(el) // 获取el的outerHTML
    }
    /*******************************
     *         编译相关的代码        *
     ******************************/
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 执行之前缓存的vue原型上定义的mount方法
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML(el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue