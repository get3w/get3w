package site

import (
	"path"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
)

// Site contains attributes and operations of the app
type Site struct {
	Name                  string
	ReadObject            func(key string) (string, error)
	WriteObject           func(key, value string) error
	WriteBinaryObject     func(key string, bs []byte) (bool, error)
	CopyObject            func(sourceKey, destinationKey string) error
	DeleteObjectsByPrefix func(prefix string) error
	DeleteObject          func(key string) error
	GetKeys               func(prefix string) ([]string, error)
	GetFiles              func(appname string, prefix string) ([]*get3w.File, error)

	config *get3w.Config
}

// GetPageKey get key by pageName
func (site *Site) GetPageKey(pageName string) string {
	return path.Join(site.Name, "_pages", pageName+".yml")
}

// GetSectionHTMLKey get html file key by sectionName
func (site *Site) GetSectionHTMLKey(sectionName string) string {
	return path.Join(site.Name, "_sections", sectionName+".html")
}

// GetSectionCSSKey get css file key by sectionName
func (site *Site) GetSectionCSSKey(sectionName string) string {
	return path.Join(site.Name, "_sections", sectionName+".css")
}

// GetSectionJSKey get js file key by sectionName
func (site *Site) GetSectionJSKey(sectionName string) string {
	return path.Join(site.Name, "_sections", sectionName+".js")
}

// GetSectionPreviewHTMLKey get preview file key by sectionName
func (site *Site) GetSectionPreviewHTMLKey(sectionName string) string {
	return path.Join(site.Name, "_sections", sectionName+"-preview.html")
}

// GetSectionPreviewPNGKey get preview cover file key by sectionName
func (site *Site) GetSectionPreviewPNGKey(sectionName string) string {
	return path.Join(site.Name, "_sections", sectionName+".png")
}

// GetConfigKey get preview config file key
func (site *Site) GetConfigKey() string {
	return path.Join(site.Name, "_config.yml")
}

// GetKey get file key by relatedURL
func (site *Site) GetKey(relatedURL string) string {
	return path.Join(site.Name, relatedURL)
}

// GetConfig get config file content
func (site *Site) GetConfig() *get3w.Config {
	if site.config == nil {
		config := &get3w.Config{}
		configKey := site.GetConfigKey()
		configData, err := site.ReadObject(configKey)
		if err != nil {
			if len(configData) > 0 {
				config.Load(configData)
			}
		}

		site.config = config
	}
	return site.config
}

// ReadSectionHTML get section html file content
func (site *Site) ReadSectionHTML(sectionName string) string {
	keyName := site.GetSectionHTMLKey(sectionName)
	str, err := site.ReadObject(keyName)
	if err != nil {
		return ""
	}
	return str
}

// ReadSectionCSS get section css file content
func (site *Site) ReadSectionCSS(sectionName string) string {
	keyName := site.GetSectionCSSKey(sectionName)
	str, err := site.ReadObject(keyName)
	if err != nil {
		return ""
	}
	return str
}

// ReadSectionJS get section js file content
func (site *Site) ReadSectionJS(sectionName string) string {
	keyName := site.GetSectionJSKey(sectionName)
	str, err := site.ReadObject(keyName)
	if err != nil {
		return ""
	}
	return str
}

// WriteBinary write binary
func (site *Site) WriteBinary(path string, bs []byte) {
	key := site.Name + "/" + path
	site.WriteBinaryObject(key, bs)
}

// WriteConfig write content to config file
func (site *Site) WriteConfig(config *get3w.Config) {
	if config != nil {
		configKey := site.GetConfigKey()
		yaml, err := config.String()
		if err != nil {
			site.WriteObject(configKey, yaml)
		}
	}
}

// WritePage write content to page file
func (site *Site) WritePage(page *get3w.Page) {
	if page != nil {
		pageKey := site.GetPageKey(page.Name)
		yaml, err := page.String()
		if err != nil {
			site.WriteObject(pageKey, yaml)
		}
	}
}

// SaveSection write content to section
func (site *Site) SaveSection(section *get3w.Section) {
	site.WriteObject(site.GetSectionHTMLKey(section.Name), section.HTML)
	site.WriteObject(site.GetSectionCSSKey(section.Name), section.CSS)
	site.WriteObject(site.GetSectionJSKey(section.Name), section.JS)
	previewHTML := `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>` + section.Name + `</title>
    <link href="http://cdn.get3w.com/assets/css/font-awesome/4.4.0/css/font-awesome.min.css" rel="stylesheet">
    <link href="http://cdn.get3w.com/assets/css/animate.css/3.4.0/animate.min.css" rel="stylesheet">
    <link href="http://cdn.get3w.com/assets/css/csstoolkits/0.0.1/ct.min.css" rel="stylesheet">
    <link href="` + section.Name + `.css" rel="stylesheet">
</head>
<body>
<section class="this">
    ` + section.HTML + `
</section>
<script src="` + section.Name + `.js"></script>
</body>
</html>`
	site.WriteObject(site.GetSectionPreviewHTMLKey(section.Name), previewHTML)
}

// ChangeAppName change the name of app
func (site *Site) ChangeAppName(newName string) {
	if site.Name != newName {
		config := site.GetConfig()
		config.Name = newName
		site.WriteConfig(config)

		sourceKeys, err := site.GetKeys(site.Name)
		if err != nil {
			for _, sourceKey := range sourceKeys {
				destinationKey := strings.Replace(sourceKey, site.Name, newName, 1)
				err := site.CopyObject(sourceKey, destinationKey)
				if err != nil {
					return
				}
			}
			site.DeleteAll()
		}
	}
}

// GetPage get page models by pageName
func (site *Site) GetPage(pageName string) *get3w.Page {
	pageKey := site.GetPageKey(pageName)
	page := &get3w.Page{}
	pageData, err := site.ReadObject(pageKey)
	if err != nil {
		if len(pageData) > 0 {
			page.Load(pageData)
		}
	}

	page.Name = pageName
	return page
}

// DeleteAll delete all files of this app
func (site *Site) DeleteAll() {
	site.DeleteObjectsByPrefix(site.Name)
}

// DeletePage delete page file
func (site *Site) DeletePage(pageName string) {
	site.DeleteObject(site.GetPageKey(pageName))
}

// DeleteSection delete section files
func (site *Site) DeleteSection(sectionName string) {
	site.DeleteObject(site.GetSectionHTMLKey(sectionName))
	site.DeleteObject(site.GetSectionCSSKey(sectionName))
	site.DeleteObject(site.GetSectionJSKey(sectionName))
	site.DeleteObject(site.GetSectionPreviewHTMLKey(sectionName))
	site.DeleteObject(site.GetSectionPreviewPNGKey(sectionName))
}

// SendAllFiles send all files to another app
func (site *Site) SendAllFiles(targetsite *Site) {
	sourceKeys, err := site.GetKeys(site.Name)
	if err != nil {
		for _, sourceKey := range sourceKeys {
			destinationKey := strings.Replace(sourceKey, site.Name, targetsite.Name, 1)
			site.CopyObject(sourceKey, destinationKey)
		}
	}
}

// ReadFileContent return file content
func (site *Site) ReadFileContent(key string) string {
	key = path.Join(site.Name, key)
	str, err := site.ReadObject(key)
	if err != nil {
		return ""
	}
	return str
}

// WriteFileContent update file content
func (site *Site) WriteFileContent(key string, content string) {
	key = path.Join(site.Name, key)
	site.WriteObject(key, content)
}

// NewFolder create folder
func (site *Site) NewFolder(key string) {
	key = path.Join(site.Name, key)
	key = strings.Trim(strings.TrimSpace(key), "/") + "/"
	site.WriteObject(key, "")
}

// DeleteFile delete file
func (site *Site) DeleteFile(key string) {
	key = path.Join(site.Name, key)
	site.DeleteObject(key)
}

// DeleteFolder delete folder
func (site *Site) DeleteFolder(key string) {
	key = path.Join(site.Name, key)
	key = strings.Trim(strings.TrimSpace(key), "/") + "/"
	site.DeleteObject(key)
}
