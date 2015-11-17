package appfile

import (
	"path"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
)

// Appfile contains attributes and operations of the app
type Appfile struct {
	Name                  string
	ReadObject            func(key string) (string, error)
	WriteObject           func(key, value string) error
	CopyObject            func(sourceKey, destinationKey string) error
	DeleteObjectsByPrefix func(prefix string) error
	DeleteObject          func(key string) error
	GetKeys               func(prefix string) ([]string, error)
	GetFiles              func(appname string, prefix string) ([]*get3w.File, error)

	config *get3w.Config
}

// GetPageKey get key by pageName
func (appfile *Appfile) GetPageKey(pageName string) string {
	return path.Join(appfile.Name, "_pages", pageName+".yml")
}

// GetSectionHTMLKey get html file key by sectionName
func (appfile *Appfile) GetSectionHTMLKey(sectionName string) string {
	return path.Join(appfile.Name, "_sections", sectionName+".html")
}

// GetSectionCSSKey get css file key by sectionName
func (appfile *Appfile) GetSectionCSSKey(sectionName string) string {
	return path.Join(appfile.Name, "_sections", sectionName+".css")
}

// GetSectionJSKey get js file key by sectionName
func (appfile *Appfile) GetSectionJSKey(sectionName string) string {
	return path.Join(appfile.Name, "_sections", sectionName+".js")
}

// GetSectionPreviewHTMLKey get preview file key by sectionName
func (appfile *Appfile) GetSectionPreviewHTMLKey(sectionName string) string {
	return path.Join(appfile.Name, "_sections", sectionName+"-preview.html")
}

// GetSectionPreviewPNGKey get preview cover file key by sectionName
func (appfile *Appfile) GetSectionPreviewPNGKey(sectionName string) string {
	return path.Join(appfile.Name, "_sections", sectionName+".png")
}

// GetConfigKey get preview config file key
func (appfile *Appfile) GetConfigKey() string {
	return path.Join(appfile.Name, "_config.yml")
}

// GetKey get file key by relatedURL
func (appfile *Appfile) GetKey(relatedURL string) string {
	return path.Join(appfile.Name, relatedURL)
}

// GetConfig get config file content
func (appfile *Appfile) GetConfig() *get3w.Config {
	if appfile.config == nil {
		config := &get3w.Config{}
		configKey := appfile.GetConfigKey()
		configData, err := appfile.ReadObject(configKey)
		if err != nil {
			if len(configData) > 0 {
				config.Load(configData)
			}
		}

		appfile.config = config
	}
	return appfile.config
}

// ReadSectionHTML get section html file content
func (appfile *Appfile) ReadSectionHTML(sectionName string) string {
	keyName := appfile.GetSectionHTMLKey(sectionName)
	str, err := appfile.ReadObject(keyName)
	if err != nil {
		return ""
	}
	return str
}

// ReadSectionCSS get section css file content
func (appfile *Appfile) ReadSectionCSS(sectionName string) string {
	keyName := appfile.GetSectionCSSKey(sectionName)
	str, err := appfile.ReadObject(keyName)
	if err != nil {
		return ""
	}
	return str
}

// ReadSectionJS get section js file content
func (appfile *Appfile) ReadSectionJS(sectionName string) string {
	keyName := appfile.GetSectionJSKey(sectionName)
	str, err := appfile.ReadObject(keyName)
	if err != nil {
		return ""
	}
	return str
}

// WriteConfig write content to config file
func (appfile *Appfile) WriteConfig(config *get3w.Config) {
	if config != nil {
		configKey := appfile.GetConfigKey()
		yaml, err := config.String()
		if err != nil {
			appfile.WriteObject(configKey, yaml)
		}
	}
}

// WritePage write content to page file
func (appfile *Appfile) WritePage(page *get3w.Page) {
	if page != nil {
		pageKey := appfile.GetPageKey(page.Name)
		yaml, err := page.String()
		if err != nil {
			appfile.WriteObject(pageKey, yaml)
		}
	}
}

// SaveSection write content to section
func (appfile *Appfile) SaveSection(section *get3w.Section) {
	appfile.WriteObject(appfile.GetSectionHTMLKey(section.Name), section.HTML)
	appfile.WriteObject(appfile.GetSectionCSSKey(section.Name), section.CSS)
	appfile.WriteObject(appfile.GetSectionJSKey(section.Name), section.JS)
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
	appfile.WriteObject(appfile.GetSectionPreviewHTMLKey(section.Name), previewHTML)
}

// ChangeAppName change the name of app
func (appfile *Appfile) ChangeAppName(newName string) {
	if appfile.Name != newName {
		config := appfile.GetConfig()
		config.Name = newName
		appfile.WriteConfig(config)

		sourceKeys, err := appfile.GetKeys(appfile.Name)
		if err != nil {
			for _, sourceKey := range sourceKeys {
				destinationKey := strings.Replace(sourceKey, appfile.Name, newName, 1)
				err := appfile.CopyObject(sourceKey, destinationKey)
				if err != nil {
					return
				}
			}
			appfile.DeleteAll()
		}
	}
}

// GetPage get page models by pageName
func (appfile *Appfile) GetPage(pageName string) *get3w.Page {
	pageKey := appfile.GetPageKey(pageName)
	page := &get3w.Page{}
	pageData, err := appfile.ReadObject(pageKey)
	if err != nil {
		if len(pageData) > 0 {
			page.Load(pageData)
		}
	}

	page.Name = pageName
	return page
}

// DeleteAll delete all files of this app
func (appfile *Appfile) DeleteAll() {
	appfile.DeleteObjectsByPrefix(appfile.Name)
}

// DeletePage delete page file
func (appfile *Appfile) DeletePage(pageName string) {
	appfile.DeleteObject(appfile.GetPageKey(pageName))
}

// DeleteSection delete section files
func (appfile *Appfile) DeleteSection(sectionName string) {
	appfile.DeleteObject(appfile.GetSectionHTMLKey(sectionName))
	appfile.DeleteObject(appfile.GetSectionCSSKey(sectionName))
	appfile.DeleteObject(appfile.GetSectionJSKey(sectionName))
	appfile.DeleteObject(appfile.GetSectionPreviewHTMLKey(sectionName))
	appfile.DeleteObject(appfile.GetSectionPreviewPNGKey(sectionName))
}

// SendAllFiles send all files to another app
func (appfile *Appfile) SendAllFiles(targetApp *Appfile) {
	sourceKeys, err := appfile.GetKeys(appfile.Name)
	if err != nil {
		for _, sourceKey := range sourceKeys {
			destinationKey := strings.Replace(sourceKey, appfile.Name, targetApp.Name, 1)
			appfile.CopyObject(sourceKey, destinationKey)
		}
	}
}

// ReadFileContent return file content
func (appfile *Appfile) ReadFileContent(key string) string {
	key = path.Join(appfile.Name, key)
	str, err := appfile.ReadObject(key)
	if err != nil {
		return ""
	}
	return str
}

// WriteFileContent update file content
func (appfile *Appfile) WriteFileContent(key string, content string) {
	key = path.Join(appfile.Name, key)
	appfile.WriteObject(key, content)
}

// NewFolder create folder
func (appfile *Appfile) NewFolder(key string) {
	key = path.Join(appfile.Name, key)
	key = strings.Trim(strings.TrimSpace(key), "/") + "/"
	appfile.WriteObject(key, "")
}

// DeleteFile delete file
func (appfile *Appfile) DeleteFile(key string) {
	key = path.Join(appfile.Name, key)
	appfile.DeleteObject(key)
}

// DeleteFolder delete folder
func (appfile *Appfile) DeleteFolder(key string) {
	key = path.Join(appfile.Name, key)
	key = strings.Trim(strings.TrimSpace(key), "/") + "/"
	appfile.DeleteObject(key)
}
