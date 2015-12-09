package storage

import "github.com/get3w/get3w/repos"

// getLayoutKey get html file key by sectionName
func (site *Site) getLayoutKey(layout string) string {
	return site.GetSourceKey(repos.PrefixLayouts, layout)
}

func (site *Site) getLayoutTemplate(layout string) string {
	if layout == "" {
		return ""
	}

	template, _ := site.Read(site.getLayoutKey(layout))
	return string(template)
}
