package storage

import (
	"path/filepath"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/stringutils"
)

// sectionKey get html file key by sectionName
func (site *Site) sectionKey(relatedURL string) string {
	return site.key(PrefixSections, relatedURL)
}

// GetSections get page models by pageName
func (site *Site) GetSections() map[string]*get3w.Section {
	if site.sections == nil {
		sections := make(map[string]*get3w.Section)
		files, err := site.Storage.GetFiles(site.prefix(PrefixSections))
		if err != nil {
			return nil
		}

		for _, file := range files {
			ext := filepath.Ext(file.Path)
			if ext != ExtHTML && ext != ExtCSS && ext != ExtJS {
				continue
			}
			sectionName := strings.Replace(file.Name, ext, "", 1)
			section := sections[sectionName]
			if section == nil {
				section = &get3w.Section{
					ID:   stringutils.Base64ForURLEncode(sectionName),
					Name: sectionName,
				}
			}
			if ext == ExtHTML {
				section.HTML, _ = site.ReadSectionContent(file)
			} else if ext == ExtCSS {
				section.CSS, _ = site.ReadSectionContent(file)
			} else if ext == ExtJS {
				section.JS, _ = site.ReadSectionContent(file)
			}

			sections[sectionName] = section
		}

		site.sections = sections
	}

	return site.sections
}

// ReadSectionContent get section file content
func (site *Site) ReadSectionContent(file *get3w.File) (string, error) {
	keyName := site.sectionKey(file.Name)
	str, err := site.Storage.Read(keyName)
	if err != nil {
		return "", err
	}

	return string(str), nil
}

// SaveSection write content to section
func (site *Site) SaveSection(section *get3w.Section) error {
	if err := site.Storage.Write(site.sectionKey(section.Name+ExtHTML), []byte(section.HTML)); err != nil {
		return err
	}
	if err := site.Storage.Write(site.sectionKey(section.Name+ExtCSS), []byte(section.CSS)); err != nil {
		return err
	}
	if err := site.Storage.Write(site.sectionKey(section.Name+ExtJS), []byte(section.JS)); err != nil {
		return err
	}
	return nil
	// 	previewHTML := `<!DOCTYPE html>
	// <html lang="en">
	// <head>
	//     <meta charset="utf-8">
	//     <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
	//     <meta name="viewport" content="width=device-width, initial-scale=1">
	//     <title>` + section.Name + `</title>
	//     <link href="http://cdn.get3w.com/assets/css/font-awesome/4.4.0/css/font-awesome.min.css" rel="stylesheet">
	//     <link href="http://cdn.get3w.com/assets/css/animate.css/3.4.0/animate.min.css" rel="stylesheet">
	//     <link href="http://cdn.get3w.com/assets/css/csstoolkits/0.0.1/ct.min.css" rel="stylesheet">
	//     <link href="` + section.Name + `.css" rel="stylesheet">
	// </head>
	// <body>
	// <section class="this">
	//     ` + section.HTML + `
	// </section>
	// <script src="` + section.Name + `.js"></script>
	// </body>
	// </html>`
	// 	site.WritePreview(site.getSectionKey(section.Name+parser.ExtHTML), []byte(previewHTML))
}

// DeleteSection delete section files
func (site *Site) DeleteSection(sectionName string) error {
	if err := site.Storage.Delete(site.sectionKey(sectionName + ExtHTML)); err != nil {
		return err
	}
	if err := site.Storage.Delete(site.sectionKey(sectionName + ExtCSS)); err != nil {
		return err
	}
	if err := site.Storage.Delete(site.sectionKey(sectionName + ExtJS)); err != nil {
		return err
	}
	return nil
}
