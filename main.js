'use strict'

const { Plugin, PluginSettingTab, Setting } = require('obsidian')

const PROXY_LIST = [
  { name: 'ghproxy1', url: 'gh-proxy.com/https://github.com' },
  { name: 'ghproxy2', url: 'ghproxy.cc/https://github.com' },
  { name: 'ghproxy3', url: 'ghproxy.cn/https://github.com' },
  { name: 'ghproxy4', url: 'www.ghproxy.cn/https://github.com' },
  { name: 'site', url: 'github.site' },
  { name: 'store', url: 'github.store' },
  { name: 'kkgithub', url: 'kkgithub.com' },
]

const DEFAULT_SETTINGS = {
  enabled: true,
  userProxy: undefined,
  selectedProxy: 'ghproxy1',
  useCustomProxy: false,
  finalProxy: undefined,
  dev: false,
}

function debounce(fn, delay) {
  let timer = null
  return async function (...args) {
    clearTimeout(timer)
    return new Promise(resolve => {
      timer = setTimeout(async () => {
        const result = await fn(...args)
        resolve(result)
      }, delay)
    })
  }
}

class MyPluginSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  updateFinalProxy() {
    this.plugin.settings.finalProxy =
      this.plugin.settings.useCustomProxy && !!this.plugin.settings.userProxy
        ? this.plugin.settings.userProxy
        : PROXY_LIST.find(proxy => proxy.name === this.plugin.settings.selectedProxy)?.url
    new window.Notice(`当前 GitHub 镜像：${this.plugin.settings.finalProxy}`)
  }

  display() {
    this.containerEl.empty()

    new Setting(this.containerEl)
      .setName('是否启用')
      .setDesc('启用或禁用 Github 镜像')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enabled).onChange(async value => {
          this.plugin.settings.enabled = value
          await this.plugin.saveSettings()
        })
      )

    // todo notice on change
    new Setting(this.containerEl)
      .setName('Github 镜像列表')
      .setDesc('选择一个 Github 镜像镜像')
      .addDropdown(dropdown => {
        PROXY_LIST.forEach(proxy => {
          dropdown.addOption(proxy.name, proxy.name)
        })
        dropdown.setValue(this.plugin.settings.selectedProxy || '').onChange(async value => {
          this.plugin.settings.selectedProxy = value
          this.updateFinalProxy()
          await this.plugin.saveSettings()
        })
      })

    new Setting(this.containerEl)
      .setName('使用自定义镜像')
      .setDesc('启用或禁用自定义镜像')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.useCustomProxy).onChange(async value => {
          this.plugin.settings.useCustomProxy = value
          this.updateFinalProxy()
          await this.plugin.saveSettings()
        })
      )

    new Setting(this.containerEl)
      .setName('自定义镜像')
      .setDesc(
        '输入自定义的镜像 URL，可以参照 https://github.com/subframe7536/cf-workers-proxy 自行部署，最终地址为 https://${你的镜像地址}/用户/仓库/...'
      )
      .addText(text =>
        text.setValue(this.plugin.settings.userProxy || '').onChange(
          debounce(async value => {
            this.plugin.settings.userProxy = value
            await this.plugin.saveSettings()
            if (this.plugin.settings.useCustomProxy) {
              this.updateFinalProxy()
            }
          }, 1000)
        )
      )

    new Setting(this.containerEl)
      .setName('开发模式')
      .setDesc('启用开发模式，打开控制台查看结果')
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.dev).onChange(async value => {
          this.plugin.settings.dev = value
          await this.plugin.saveSettings()
        })
      )
  }
}

function patchURL(proxy, url) {
  if (!proxy) {
    console.log('没有代理，返回原 URL')
    return url
  }
  if (url.startsWith('https://raw.githubusercontent.com')) {
    url = url.replace(/^https:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\//, `https://github.com/$1/$2/raw/`)
  }
  if (url.startsWith('https://github.com/')) {
    url = url.replace('github.com', proxy)
  }
  return url
}

class MyPlugin extends Plugin {
  settings
  async onload() {
    if (!window.electron) {
      new window.Notice('暂时不支持非桌面端')
      console.log('暂时不支持非桌面端')
      return
    }
    await this.loadSettings()
    console.log('Github 镜像插件已加载')
    const settingTab = new MyPluginSettingTab(this.app, this)
    if (this.settings.enabled) {
      settingTab.updateFinalProxy()
      console.log('当前镜像', this.settings.finalProxy)
    } else {
      console.log('未启用')
    }
    this.addSettingTab(settingTab)
    const originalSend = window.electron.ipcRenderer.send
    window.electron.ipcRenderer.send = (...args) => originalSend(...this.patch(args))
  }
  patch(args) {
    if (!this.settings.enabled) {
      return args
    }
    if (args[0] === 'request-url') {
      args[2] = {
        ...args[2],
        url: patchURL(this.settings.finalProxy, args[2].url),
      }
      if (this.settings.dev) {
        console.log(args[2])
      }
    }
    return args
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }
  async saveSettings() {
    await this.saveData(this.settings)
  }
}

module.exports = MyPlugin
