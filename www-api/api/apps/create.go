package apps

import (
	"net/http"
	"strings"
	"time"

	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/bairongsoft/get3w-utils/utils"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-api/api"

	"github.com/labstack/echo"
)

// Create app
func Create(c *echo.Context) error {
	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}
	owner := api.Owner(c)
	appDAO := dao.NewAppDAO()

	input := &get3w.AppCreateInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	name := strings.ToLower(strings.TrimSpace(input.Name))
	if !utils.IsAppname(name) {
		return api.ErrorBadRequest(c, get3w.Error(api.ErrAppnameNotValid))
	}
	nameExist, err := appDAO.IsNameExists(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if nameExist {
		return api.ErrorBadRequest(c, get3w.Error(api.ErrAppnameExist))
	}

	app := &get3w.App{
		Owner:       owner,
		Name:        name,
		Description: input.Description,
		Tags:        input.Tags,
		Private:     input.Private,
		CreatedAt:   timeutils.ToString(time.Now()),
		UpdatedAt:   timeutils.ToString(time.Now()),
	}

	parser, err := storage.NewS3Parser(utils.BucketAppSource, utils.BucketAppDestination, app.Owner, app.Name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	if input.Origin != "" {
		var originApp *get3w.App
		if strings.Contains(input.Origin, "/") {
			arr := strings.Split(input.Origin, "/")
			originApp, err = appDAO.GetApp(arr[0], arr[1])
		} else {
			originApp, err = appDAO.GetAppByID(input.Origin)
		}
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		if originApp != nil && !originApp.Private {
			app.Origin = originApp.Owner + "/" + originApp.Name
			appID, err := appDAO.Insert(app)
			if err != nil {
				return api.ErrorInternal(c, err)
			}

			app.ID = appID
			parserOrigin, err := storage.NewS3Parser(utils.BucketAppSource, utils.BucketAppDestination, originApp.Owner, originApp.Name)
			if err != nil {
				return api.ErrorInternal(c, err)
			}
			parserOrigin.Storage.Rename(owner, app.Name, false)
			//parserOrigin.SendAllFiles(s)

			parser.Config.Title = app.Name
			parser.WriteConfig()

			originApp.CloneCount++
			appDAO.Update(originApp)
		}
	}

	if app.ID == "" {
		appID, err := appDAO.Insert(app)
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		app.ID = appID

		link := &get3w.Link{
			Name:     "Homepage",
			Title:    "Homepage",
			Sections: []string{},
		}

		parser.Config.Description = app.Description
		parser.WriteConfig()
		parser.WriteLink(link)
	}

	return c.JSON(http.StatusOK, app)
}
