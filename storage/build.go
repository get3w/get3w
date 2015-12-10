package storage

import (
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser"
	"github.com/get3w/get3w/pkg/stringutils"
	"github.com/get3w/get3w/repos"
)

// Build all pages in the app.
func (site *Site) Build() error {
	pages := site.GetPages()
	sections := site.GetSections()
	destinationPrefix := site.GetSourcePrefix(repos.PrefixDestination)

	// err := site.DeleteFolder(destinationPrefix)
	// if err != nil {
	// 	return err
	// }
	err := site.NewFolder(destinationPrefix)
	if err != nil {
		return err
	}

	err = site.buildCopy(pages)
	if err != nil {
		return err
	}

	err = site.buildPages(pages, sections)
	if err != nil {
		return err
	}

	err = site.buildDocs()
	if err != nil {
		return err
	}

	return nil
}

func (site *Site) getExcludeKeys(pages []*get3w.Page) []string {
	excludeKeys := []string{}
	for _, page := range pages {
		if page.Path != "" {
			excludeKeys = append(excludeKeys, site.GetSourceKey(page.Path))
		}
		if len(page.Children) > 0 {
			childKeys := site.getExcludeKeys(page.Children)
			for _, childKey := range childKeys {
				excludeKeys = append(excludeKeys, childKey)
			}
		}
	}
	return excludeKeys
}

func (site *Site) buildCopy(pages []*get3w.Page) error {
	excludeKeys := []string{
		site.GetSourceKey("_"),
		site.GetSourceKey(repos.KeyConfig),
		site.GetSourceKey(repos.KeyReadme),
		site.GetSourceKey(repos.KeyGitIgnore),
		site.GetSourceKey(repos.KeyLicense),
	}

	for _, excludeKey := range site.getExcludeKeys(pages) {
		excludeKeys = append(excludeKeys, excludeKey)
	}

	files, err := site.GetAllFiles(site.GetSourcePrefix(""))
	if err != nil {
		return err
	}

	for _, file := range files {
		if file.IsDir {
			continue
		}
		sourceKey := site.GetSourceKey(file.Path)

		if !stringutils.HasPrefixIgnoreCase(excludeKeys, sourceKey) {
			destinationKey := site.GetDestinationKey(file.Path)
			err := site.CopyToDestination(sourceKey, destinationKey)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func (site *Site) buildPages(pages []*get3w.Page, sections map[string]*get3w.Section) error {
	for _, page := range pages {
		docs, _ := site.GetDocs(page.DocFolder)
		template := site.getTemplate(page.Layout, site.Config.LayoutPage)
		parsedContent := parser.ParsePage(site.Path, template, site.Config, page, sections, docs)

		err := site.WriteDestination(site.GetDestinationKey(page.URL), []byte(parsedContent))
		if err != nil {
			return err
		}

		if len(page.Children) > 0 {
			site.buildPages(page.Children, sections)
		}
	}
	return nil
}

func (site *Site) buildDocs() error {
	docs, _ := site.GetDocs("")
	if len(docs) > 0 {
		for _, doc := range docs {
			err := site.buildDoc(doc)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func (site *Site) buildDoc(doc map[string]string) error {
	template := site.getTemplate(doc["layout"], site.Config.LayoutDoc)
	parsedContent := parser.ParseDoc(site.Path, template, site.Config, doc)
	url := doc["url"]
	err := site.WriteDestination(site.GetDestinationKey(url), []byte(parsedContent))
	if err != nil {
		return err
	}

	return nil
}
