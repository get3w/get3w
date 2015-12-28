package apps

import (
	"net/http"
	"time"

	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-api/api"

	"github.com/labstack/echo"
)

// Save app
func Save(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	appDAO := dao.NewAppDAO()

	input := &get3w.AppSaveInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	app, err := appDAO.GetApp(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewS3Parser(utils.BucketAppSource, utils.BucketAppDestination, app.Owner, app.Name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	for _, link := range input.Links {
		parser.WriteLink(link)
	}

	for _, section := range input.Sections {
		parser.SaveSection(section)
	}

	if input.Config != nil {
		//config := parser.GetConfig()

		// for _, pageName := range config.Pages {
		// 	if !stringutils.Contains(input.Config.Pages, pageName) {
		// 		parser.DeletePage(pageName)
		// 	}
		// }
		//
		// for _, sectionName := range config.Sections {
		// 	if !stringutils.Contains(input.Config.Sections, sectionName) {
		// 		parser.DeleteSection(sectionName)
		// 	}
		// }

		if app.Description == "" && input.Config.Description != "" {
			app.Description = input.Config.Description
		}

		parser.Config = input.Config
		parser.WriteConfig()
	}

	updatedAt := timeutils.ToString(time.Now())
	err = appDAO.UpdateUpdatedAt(app.Owner, app.Name, updatedAt)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	return c.JSON(http.StatusOK, &get3w.AppSaveOutput{
		LastModified: updatedAt,
	})
}
